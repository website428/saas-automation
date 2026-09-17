import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = ['queued', 'sending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed', 'cancelled'] as const;

async function exactQueueCount(campaignId: string, status?: string, initialOnly = false) {
    let query = serverSupabase
        .from('email_queue')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId);
    if (status) query = query.eq('status', status);
    if (initialOnly) query = query.eq('sequence_step', 1);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
}

export async function GET(
    _req: NextRequest,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        const [statusPairs, initialPairs, recipients, replies] = await Promise.all([
            Promise.all(STATUSES.map(async status => [status, await exactQueueCount(id, status)] as const)),
            Promise.all(STATUSES.map(async status => [status, await exactQueueCount(id, status, true)] as const)),
            exactQueueCount(id, undefined, true),
            serverSupabase
                .from('inbox_threads')
                .select('id', { count: 'exact', head: true })
                .eq('campaign_id', id)
                .then(({ count, error }) => {
                    if (error) throw error;
                    return count ?? 0;
                }),
        ]);

        const statuses = Object.fromEntries(statusPairs) as Record<typeof STATUSES[number], number>;
        const initialStatuses = Object.fromEntries(initialPairs) as Record<typeof STATUSES[number], number>;
        const accepted = statuses.sent + statuses.delivered + statuses.opened + statuses.clicked + statuses.bounced + statuses.complained;
        const delivered = statuses.delivered + statuses.opened + statuses.clicked + statuses.complained;
        const opened = statuses.opened + statuses.clicked;
        const issues = statuses.bounced + statuses.complained + statuses.failed;
        const initialProcessed = recipients - initialStatuses.queued - initialStatuses.sending;

        return NextResponse.json({
            recipients,
            statuses,
            initialStatuses,
            accepted,
            delivered,
            opened,
            replies,
            issues,
            initialProcessed: Math.max(0, initialProcessed),
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Could not load delivery report' },
            { status: 500 },
        );
    }
}

