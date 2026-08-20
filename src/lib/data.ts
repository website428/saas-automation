import { supabase } from './supabase';

// ─── Dashboard Stats ─────────────────────────────────────────

export interface DashboardStats {
    total_contacts: number;
    total_sent: number;
    total_pending: number;
    total_opened: number;
    total_bounced: number;
    active_campaigns: number;
    open_rate: number;
    bounce_rate: number;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
    const { data, error } = await supabase
        .from('dashboard_stats')
        .select('*')
        .single();

    if (error || !data) {
        return {
            total_contacts: 0,
            total_sent: 0,
            total_pending: 0,
            total_opened: 0,
            total_bounced: 0,
            active_campaigns: 0,
            open_rate: 0,
            bounce_rate: 0,
        };
    }

    const sent = Number(data.total_sent) || 0;
    const opened = Number(data.total_opened) || 0;
    const bounced = Number(data.total_bounced) || 0;

    return {
        total_contacts: Number(data.total_contacts) || 0,
        total_sent: sent,
        total_pending: Number(data.total_pending) || 0,
        total_opened: opened,
        total_bounced: bounced,
        active_campaigns: Number(data.active_campaigns) || 0,
        open_rate: sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0,
        bounce_rate: sent > 0 ? Math.round((bounced / sent) * 1000) / 10 : 0,
    };
}

// ─── Domain Health ───────────────────────────────────────────

export interface DomainHealth {
    id: string;
    domain_name: string;
    from_email: string;
    warmup_day: number;
    daily_limit: number;
    emails_sent_today: number;
    status: string;
    bounce_rate: number;
    health_score: number;
    warmup_start: string | null;
    queued_count: number;
    total_sent: number;
}

export async function fetchDomainHealth(): Promise<DomainHealth[]> {
    const { data, error } = await supabase
        .from('domain_health')
        .select('*')
        .order('domain_name');

    if (error || !data) return [];
    return data as DomainHealth[];
}

// ─── Campaigns ───────────────────────────────────────────────

export interface CampaignRow {
    id: string;
    name: string;
    domain_name: string;
    status: string;
    sent_count: number;
    total_contacts: number;
    opened_count: number;
    bounced_count: number;
    created_at: string;
}

export async function fetchCampaigns(): Promise<CampaignRow[]> {
    const { data, error } = await supabase
        .from('campaigns')
        .select(`
      id,
      name,
      status,
      sent_count,
      total_contacts,
      opened_count,
      bounced_count,
      created_at,
      domains (domain_name)
    `)
        .order('created_at', { ascending: false })
        .limit(10);

    if (error || !data) return [];

    return data.map((c: any) => ({
        id: c.id,
        name: c.name,
        domain_name: c.domains?.domain_name || '',
        status: c.status,
        sent_count: c.sent_count,
        total_contacts: c.total_contacts,
        opened_count: c.opened_count,
        bounced_count: c.bounced_count,
        created_at: c.created_at,
    }));
}

// ─── Live Queue ──────────────────────────────────────────────

export interface QueueItem {
    id: string;
    contact_email: string;
    domain_name: string;
    sequence_step: number;
    scheduled_at: string;
    status: string;
}

export async function fetchLiveQueue(): Promise<QueueItem[]> {
    const { data, error } = await supabase
        .from('email_queue')
        .select(`
      id,
      sequence_step,
      scheduled_at,
      status,
      contacts (email),
      domains (domain_name)
    `)
        .in('status', ['queued', 'sent', 'sending'])
        .order('scheduled_at', { ascending: true })
        .limit(8);

    if (error || !data) return [];

    return data.map((q: any) => ({
        id: q.id,
        contact_email: q.contacts?.email || '',
        domain_name: q.domains?.domain_name || '',
        sequence_step: q.sequence_step,
        scheduled_at: q.scheduled_at,
        status: q.status,
    }));
}

// ─── Helpers ─────────────────────────────────────────────────

export function formatQueueTime(scheduledAt: string): string {
    const now = new Date();
    const scheduled = new Date(scheduledAt);
    const diffMs = scheduled.getTime() - now.getTime();
    const diffMin = Math.round(diffMs / 60000);

    // ── Past times ──────────────────────────────────────────────
    if (diffMin < -1) {
        const absMin = Math.abs(diffMin);
        if (absMin < 60) return `${absMin}m ago`;
        const hrs = Math.floor(absMin / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days < 30) return `${days}d ago`;
        const months = Math.floor(days / 30);
        if (months < 12) return `${months}mo ago`;
        const years = Math.floor(months / 12);
        return `${years}y ago`;
    }

    // ── Just now ────────────────────────────────────────────────
    if (diffMin <= 1) return 'just now';

    // ── Future times ────────────────────────────────────────────
    if (diffMin < 60) return `in ${diffMin}m`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) {
        const remainderMin = diffMin % 60;
        return remainderMin === 0 ? `in ${diffHr}h` : `in ${diffHr}h ${remainderMin}m`;
    }

    const days = Math.floor(diffHr / 24);
    if (days < 30) return `in ${days}d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `in ${months}mo`;
    const years = Math.floor(months / 12);
    return `in ${years}y`;
}

export function calcCampaignOpenRate(sent: number, opened: number): number {
    if (sent === 0) return 0;
    return Math.round((opened / sent) * 1000) / 10;
}

export function calcCampaignBounceRate(sent: number, bounced: number): number {
    if (sent === 0) return 0;
    return Math.round((bounced / sent) * 1000) / 10;
}
