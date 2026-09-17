import { NextResponse } from 'next/server';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

/** Current domain names from Resend, used to hide stale portal-only domains. */
export async function GET() {
    const apiKey = process.env.RESEND_RECEIVING_API_KEY || process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Resend API key is not configured' }, { status: 500 });

    const resend = new Resend(apiKey);
    const { data, error } = await resend.domains.list({ limit: 100 });
    if (error || !data) return NextResponse.json({ error: error?.message || 'Could not list Resend domains' }, { status: 502 });

    return NextResponse.json({ domains: data.data.map((domain) => domain.name.toLowerCase()) });
}
