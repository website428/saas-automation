export type ReplyHealthStatus = 'ready' | 'missing_mx' | 'unavailable' | 'invalid';

export type ReplyHealth = {
    replyToEmail: string;
    replyDomain: string;
    status: ReplyHealthStatus;
    mxRecords: string[];
    message: string;
};

type CacheEntry = { expiresAt: number; value: ReplyHealth };
const mxCache = new Map<string, CacheEntry>();
const CACHE_MS = 5 * 60 * 1000;

export function getReplyToEmail(sendingDomain: string): string {
    return (process.env.REPLY_TO_EMAIL || `reply@${sendingDomain}`).trim();
}

export async function checkReplyHealth(sendingDomain: string): Promise<ReplyHealth> {
    const replyToEmail = getReplyToEmail(sendingDomain);
    const replyDomain = replyToEmail.split('@')[1]?.trim().toLowerCase() || '';
    const validAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyToEmail);

    if (!validAddress || !replyDomain) {
        return {
            replyToEmail,
            replyDomain,
            status: 'invalid',
            mxRecords: [],
            message: 'REPLY_TO_EMAIL is not a valid email address.',
        };
    }

    const cached = mxCache.get(replyDomain);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    let value: ReplyHealth;
    try {
        const response = await fetch(
            `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(replyDomain)}&type=MX`,
            {
                headers: { accept: 'application/dns-json' },
                signal: AbortSignal.timeout(5000),
                cache: 'no-store',
            },
        );
        if (!response.ok) throw new Error(`DNS lookup returned HTTP ${response.status}`);

        const data = await response.json() as {
            Status?: number;
            Answer?: Array<{ data?: string }>;
        };
        const mxRecords = (data.Answer || [])
            .map(answer => answer.data?.trim() || '')
            .filter(record => record.length > 0 && !/^\d+\s+\.?$/.test(record));

        value = data.Status === 0 && mxRecords.length > 0
            ? {
                replyToEmail,
                replyDomain,
                status: 'ready',
                mxRecords,
                message: `Replies can be received at ${replyToEmail}.`,
            }
            : {
                replyToEmail,
                replyDomain,
                status: 'missing_mx',
                mxRecords: [],
                message: `${replyToEmail} cannot receive replies because ${replyDomain} has no MX record.`,
            };
    } catch {
        value = {
            replyToEmail,
            replyDomain,
            status: 'unavailable',
            mxRecords: [],
            message: `The receiving DNS for ${replyToEmail} could not be verified.`,
        };
    }

    mxCache.set(replyDomain, { expiresAt: Date.now() + CACHE_MS, value });
    return value;
}

