import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { serverSupabase } from '@/lib/server-supabase';

export const dynamic = 'force-dynamic';

/** Import new Resend domains without changing existing portal settings. */
export async function POST() {
    try {
        const apiKey = process.env.RESEND_RECEIVING_API_KEY || process.env.RESEND_API_KEY;
        if (!apiKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return NextResponse.json({ error: 'Resend or Supabase server credentials are missing' }, { status: 500 });
        }

        const resend = new Resend(apiKey);
        const { data: resendResult, error: resendError } = await resend.domains.list({ limit: 100 });
        if (resendError || !resendResult) {
            return NextResponse.json({ error: resendError?.message || 'Could not list Resend domains' }, { status: 502 });
        }

        const { data: portalDomains, error: portalError } = await serverSupabase
            .from('domains')
            .select('domain_name');
        if (portalError) throw new Error(portalError.message);

        const existing = new Set((portalDomains || []).map((domain) => domain.domain_name.toLowerCase()));
        const missing = (resendResult.data || []).filter((domain) => !existing.has(domain.name.toLowerCase()));
        if (!missing.length) return NextResponse.json({ synced: 0, alreadyPresent: resendResult.data.length, domains: [] });

        // New domains are paused to prevent an automatic campaign launch.
        const rows = missing.map((domain) => ({
            domain_name: domain.name.toLowerCase(),
            from_email: `hello@${domain.name.toLowerCase()}`,
            product_name: domain.name,
            sender_name: '',
            daily_limit: 20,
            status: 'paused',
        }));
        const { error: insertError } = await serverSupabase.from('domains').insert(rows);
        if (insertError) {
            if (insertError.message.includes('resend_api_key')) {
                return NextResponse.json({
                    error: 'Database upgrade needed: run supabase/migrations/015_remove_stored_resend_key.sql once in the Supabase SQL Editor, then sync again.',
                }, { status: 409 });
            }
            throw new Error(insertError.message);
        }

        return NextResponse.json({
            synced: rows.length,
            alreadyPresent: resendResult.data.length - rows.length,
            domains: rows.map((row) => row.domain_name),
            note: 'New domains are paused. Configure the sender identity before enabling sending.',
        });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not sync Resend domains' }, { status: 500 });
    }
}
