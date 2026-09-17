import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/server-supabase';

/**
 * Delete campaigns without breaking the reply inbox.
 *
 * Inbox conversations are historical records, so their campaign/queue
 * pointers are cleared before the campaign is removed. The conversation and
 * its messages remain available in Replies.
 */
export async function POST(req: NextRequest) {
    try {
        const payload = await req.json().catch(() => ({}));
        const rawIds = Array.isArray(payload?.ids) ? payload.ids : [];
        const ids = [...new Set(rawIds.filter((id: unknown): id is string =>
            typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
        ))];

        if (!ids.length) {
            return NextResponse.json({ error: 'Select at least one valid campaign.' }, { status: 400 });
        }
        if (ids.length > 100) {
            return NextResponse.json({ error: 'Delete at most 100 campaigns at a time.' }, { status: 400 });
        }

        // These references used to block campaign deletion. Clear them first
        // so the campaign can be deleted while preserving Inbox history.
        const { error: threadError } = await serverSupabase
            .from('inbox_threads')
            .update({ campaign_id: null, queue_id: null })
            .in('campaign_id', ids);
        if (threadError) throw new Error(`Could not detach reply threads: ${threadError.message}`);

        // Older installations have webhook_events. It is safe to skip this
        // step if that optional table has not been created yet.
        const { error: webhookError } = await serverSupabase
            .from('webhook_events')
            .update({ campaign_id: null })
            .in('campaign_id', ids);
        if (webhookError && webhookError.code !== '42P01' && webhookError.code !== 'PGRST205') {
            throw new Error(`Could not detach webhook history: ${webhookError.message}`);
        }

        const { data: deleted, error: deleteError } = await serverSupabase
            .from('campaigns')
            .delete()
            .in('id', ids)
            .select('id');
        if (deleteError) throw new Error(deleteError.message);

        return NextResponse.json({ deleted: deleted?.length || 0 });
    } catch (error: any) {
        console.error('[campaigns/bulk-delete]', error);
        return NextResponse.json({ error: error?.message || 'Could not delete campaigns.' }, { status: 500 });
    }
}
