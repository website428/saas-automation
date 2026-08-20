import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/test-resend-fetch?email_id=XXXX
 *
 * Test whether we can fetch a received email body from Resend.
 * Use the email_id from Resend Dashboard (the UUID in the URL).
 *
 * Example: /api/test-resend-fetch?email_id=9c754e8c-0c58-4225-ad80-644c5daf8bcb
 */
export async function GET(req: NextRequest) {
    const emailId = req.nextUrl.searchParams.get('email_id');
    if (!emailId) {
        return NextResponse.json({ error: 'Pass ?email_id=YOUR_EMAIL_ID from Resend dashboard' }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 });
    }

    try {
        const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });

        const body = await r.text();
        let parsed: any = null;
        try { parsed = JSON.parse(body); } catch {}

        return NextResponse.json({
            status: r.status,
            ok: r.ok,
            raw: body.substring(0, 2000),
            parsed_text: parsed?.text,
            parsed_html_length: parsed?.html?.length,
            parsed_headers: parsed?.headers,
            message_id: parsed?.message_id,
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
