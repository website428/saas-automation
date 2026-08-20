import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/fix-replies
 *
 * Backfill: finds inbox_messages with placeholder body text and
 * fetches real content from Resend's Receiving API.
 *
 * Matching strategy: sender email + closest timestamp to message created_at
 * This prevents cross-contamination where wrong email content gets assigned.
 *
 * Usage:
 *   /api/fix-replies              (fix all placeholders)
 *   /api/fix-replies?dry_run=1   (preview without writing)
 */
export async function GET(req: NextRequest) {
    const dryRun = req.nextUrl.searchParams.get('dry_run') === '1';
    const results: string[] = [];
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 });
    }

    // ── Step 1: Find all placeholder inbound messages ─────────────
    const { data: messages, error: msgErr } = await supabase
        .from('inbox_messages')
        .select('id, thread_id, body, created_at')
        .ilike('body', '%reply received%')
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(100);

    if (msgErr) {
        return NextResponse.json({ error: msgErr.message }, { status: 500 });
    }

    results.push(`Found ${messages?.length || 0} placeholder messages`);

    if (!messages || messages.length === 0) {
        // Debug: show actual inbound messages
        const { data: allInbound } = await supabase
            .from('inbox_messages')
            .select('id, body, direction, created_at')
            .eq('direction', 'inbound')
            .limit(5);
        return NextResponse.json({
            done: true, results,
            debug_inbound_sample: allInbound?.map(m => ({ id: m.id, body: m.body?.substring(0, 60) })),
        });
    }

    // ── Step 2: Fetch ALL received emails from Resend (paginated) ──
    // We need to page through to get all, since has_more=true
    let allReceived: any[] = [];
    let cursor: string | null = null;
    let page = 0;

    while (page < 5) { // max 5 pages = 500 emails
        const url: string = cursor
            ? `https://api.resend.com/emails/receiving?limit=100&after=${cursor}`
            : `https://api.resend.com/emails/receiving?limit=100`;


        const listRes = await fetch(url, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!listRes.ok) {
            results.push(`Resend List API page ${page} returned ${listRes.status}`);
            break;
        }

        const listData = await listRes.json();
        const pageEmails = listData?.data || listData?.emails || [];
        allReceived = [...allReceived, ...pageEmails];

        if (!listData.has_more || pageEmails.length === 0) break;
        cursor = pageEmails[pageEmails.length - 1]?.id;
        page++;
    }

    results.push(`Fetched ${allReceived.length} received emails from Resend`);

    // ── Step 3: For each placeholder, find the best matching email ─
    let fixed = 0;

    for (const msg of messages) {
        // Get the thread → contact email
        const { data: thread } = await supabase
            .from('inbox_threads')
            .select('id, last_message, contact_id, contacts(email, name), subject')
            .eq('id', msg.thread_id)
            .single();

        const contactEmail = (thread?.contacts as any)?.email || '';
        const msgTime = new Date(msg.created_at).getTime();
        results.push(`\nmsg ${msg.id.substring(0, 8)} | contact: ${contactEmail} | time: ${msg.created_at}`);

        // Find received emails from this sender, closest in time to the message
        const fromSender = allReceived.filter((e: any) => {
            const senderEmail = extractEmailAddr(e.from || '');
            return senderEmail.toLowerCase() === contactEmail.toLowerCase();
        });

        results.push(`  → ${fromSender.length} received emails from ${contactEmail}`);

        // Pick the one closest in time to msg.created_at
        let bestMatch: any = null;
        let bestDiff = Infinity;

        for (const e of fromSender) {
            const eTime = new Date(e.created_at).getTime();
            const diff = Math.abs(eTime - msgTime);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestMatch = e;
            }
        }

        if (!bestMatch) {
            results.push(`  → No sender match found, skipping (won't use wrong email)`);
            continue;
        }

        const diffMinutes = Math.round(bestDiff / 60000);
        const emailId = bestMatch.id || bestMatch.email_id;
        results.push(`  → Best match: ${emailId} (${diffMinutes}min apart)`);

        // Fetch body for this specific email
        const fetchRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!fetchRes.ok) {
            results.push(`  → API ${fetchRes.status} for ${emailId}`);
            continue;
        }

        const d = await fetchRes.json();
        let newBody = d.text || '';
        if (!newBody && d.html) newBody = stripHtml(d.html);

        // Strip quoted reply history
        if (newBody) {
            newBody = newBody
                .replace(/\r?\nOn .{10,200}wrote:\s*[\s\S]*/i, '')
                .replace(/On .{10,200}wrote:[\s\S]*/i, '')
                .replace(/\r?\nFrom:[\s\S]*/i, '')
                .replace(/\r?\n--\s*\r?\n[\s\S]*/, '')
                .replace(/\r?\n_{5,}[\s\S]*/, '')
                .trim();
            const lines = newBody.split('\n');
            newBody = lines.filter((l: string) => !l.trimStart().startsWith('>')).join('\n').trim();
        }

        if (!newBody || newBody.length < 2) {
            results.push(`  → Empty body after cleaning`);
            continue;
        }

        results.push(`  → Content: "${newBody.substring(0, 100)}"`);

        if (!dryRun) {
            await supabase.from('inbox_messages').update({ body: newBody }).eq('id', msg.id);

            // Update thread preview too
            if (thread && (
                (thread.last_message || '').includes('reply received') ||
                (thread.last_message || '').includes('content unavailable')
            )) {
                await supabase.from('inbox_threads')
                    .update({ last_message: newBody.substring(0, 200) })
                    .eq('id', msg.thread_id);
            }
            fixed++;
            results.push(`  → ✅ Updated`);
        } else {
            results.push(`  → (dry run — not writing)`);
        }
    }

    return NextResponse.json({ done: true, fixed, total: messages.length, dry_run: dryRun, results });
}

function extractEmailAddr(input: string): string {
    const match = input.match(/<(.+?)>/);
    return match ? match[1].trim() : input.trim();
}

function stripHtml(html: string): string {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}
