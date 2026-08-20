import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/debug-inbox
 *
 * Shows:
 * 1. All inbox_messages (last 20, any body)
 * 2. All inbox_threads (last 10)
 * 3. Resend received emails list
 * 4. Test the Receiving API for a specific email_id (optional)
 *
 * Usage:
 *   /api/debug-inbox
 *   /api/debug-inbox?email_id=9c754e8c-xxxx  (also tests that specific email)
 */
export async function GET(req: NextRequest) {
    const emailId = req.nextUrl.searchParams.get('email_id');
    const apiKey = process.env.RESEND_API_KEY;

    const result: any = {
        api_key_set: !!apiKey,
        api_key_prefix: apiKey?.substring(0, 10) + '...',
    };

    // ── All inbound inbox_messages ─────────────────────────────────
    const { data: messages, error: msgErr } = await supabase
        .from('inbox_messages')
        .select('id, thread_id, direction, body, created_at')
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(20);

    result.inbox_messages = messages?.map(m => ({
        id: m.id,
        body: m.body?.substring(0, 100),
        body_length: m.body?.length,
        created_at: m.created_at,
    })) || [];
    result.inbox_messages_error = msgErr?.message;

    // ── All inbox_threads ──────────────────────────────────────────
    const { data: threads } = await supabase
        .from('inbox_threads')
        .select('id, subject, last_message, is_read, message_count, created_at, contacts(email)')
        .order('last_at', { ascending: false })
        .limit(10);

    result.inbox_threads = threads?.map(t => ({
        id: t.id,
        subject: t.subject,
        last_message: t.last_message?.substring(0, 80),
        message_count: t.message_count,
        contact_email: (t.contacts as any)?.email,
        created_at: t.created_at,
    })) || [];

    // ── Resend received emails list ───────────────────────────────
    if (apiKey) {
        try {
            const listRes = await fetch('https://api.resend.com/emails/receiving?limit=10', {
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            const listRaw = await listRes.text();
            result.resend_list_status = listRes.status;
            result.resend_list_raw = listRaw.substring(0, 1000);

            if (listRes.ok) {
                const listData = JSON.parse(listRaw);
                const emails = listData?.data || listData?.emails || listData || [];
                result.resend_received_emails = emails.slice(0, 5).map((e: any) => ({
                    id: e.id || e.email_id,
                    from: e.from,
                    to: e.to,
                    subject: e.subject,
                    created_at: e.created_at,
                }));
            }
        } catch (e: any) {
            result.resend_list_error = e.message;
        }

        // ── Test specific email_id if provided ─────────────────────
        if (emailId) {
            try {
                const fetchRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
                    headers: { Authorization: `Bearer ${apiKey}` },
                });
                const fetchRaw = await fetchRes.text();
                result.specific_email_status = fetchRes.status;
                result.specific_email_raw = fetchRaw.substring(0, 2000);

                if (fetchRes.ok) {
                    const d = JSON.parse(fetchRaw);
                    result.specific_email_text = d.text?.substring(0, 500);
                    result.specific_email_html_length = d.html?.length;
                    result.specific_email_headers = d.headers;
                    result.specific_email_message_id = d.message_id;
                }
            } catch (e: any) {
                result.specific_email_error = e.message;
            }
        }
    }

    return NextResponse.json(result, { status: 200 });
}
