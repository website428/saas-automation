import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/server-supabase';
import { checkReplyHealth } from '@/lib/reply-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
    _req: NextRequest,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        const { data: campaign, error } = await serverSupabase
            .from('campaigns')
            .select('domains(domain_name)')
            .eq('id', id)
            .single();

        if (error || !campaign) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        const domain = campaign.domains as unknown as { domain_name: string } | null;
        if (!domain?.domain_name) {
            return NextResponse.json({ error: 'Campaign sending domain not found' }, { status: 404 });
        }

        return NextResponse.json(await checkReplyHealth(domain.domain_name));
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Could not check reply receiving' },
            { status: 500 },
        );
    }
}

