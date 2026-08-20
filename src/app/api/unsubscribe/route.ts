import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Unsubscribe endpoint — handles both GET (click link) and POST (one-click RFC 8058).
 *
 * GET  /api/unsubscribe?cid=<contact_id>&qid=<queue_id>
 *   → Marks contact as unsubscribed + redirects to confirmation page.
 *
 * POST /api/unsubscribe (body: List-Unsubscribe=One-Click)
 *   → Same action but called automatically by Gmail/Apple Mail one-click button.
 *   → Required by Gmail bulk sender policy (Feb 2024) for >5k/day senders.
 */

async function doUnsubscribe(contactId: string | null) {
    if (!contactId) return { success: false, error: 'Missing contact ID' };

    // Mark contact as unsubscribed
    await supabase
        .from('contacts')
        .update({ status: 'unsubscribed' })
        .eq('id', contactId);

    // Cancel every unsent item for this contact, including future campaigns.
    // `unsubscribed` is a contact status; the queue constraint uses `cancelled`.
    await supabase
        .from('email_queue')
        .update({ status: 'cancelled', error_message: 'Recipient unsubscribed' })
        .eq('contact_id', contactId)
        .in('status', ['queued', 'sending']);

    return { success: true };
}

// ── GET: clicked from email body link ──────────────────────────────────────
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get('cid');
    const result = await doUnsubscribe(contactId);

    if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Redirect to a simple confirmation page
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const redirectUrl = `${appBaseUrl}/unsubscribe/confirmed`;
    return NextResponse.redirect(redirectUrl, 302);
}

// ── POST: one-click unsubscribe (RFC 8058 / Gmail policy) ─────────────────
export async function POST(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get('cid');
    const result = await doUnsubscribe(contactId);
    if (!result.success) {
        return NextResponse.json(result, { status: 400 });
    }
    return new NextResponse(null, { status: 200 });
}
