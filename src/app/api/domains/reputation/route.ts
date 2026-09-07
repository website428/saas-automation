import { promises as dns } from "dns";
import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResendRecord = {
    record?: string;
    name?: string;
    type?: string;
    status?: string;
};

type ResendDomain = {
    id: string;
    name: string;
    status: string;
    region?: string;
    records?: ResendRecord[];
};

type PortalDomain = {
    id: string;
    domain_name: string;
    from_email: string;
    status: string;
    health_score: number;
    bounce_rate: number;
};

const SPAMHAUS_CODES: Record<string, string> = {
    "127.0.1.2": "spam domain",
    "127.0.1.4": "phishing domain",
    "127.0.1.5": "malware domain",
    "127.0.1.6": "botnet command-and-control domain",
    "127.0.1.102": "legitimate domain observed in spam",
    "127.0.1.103": "abused redirector domain",
    "127.0.1.104": "legitimate domain observed in phishing",
    "127.0.1.105": "legitimate domain observed serving malware",
    "127.0.1.106": "legitimate domain observed in botnet activity",
};

function dnsNotFound(error: unknown) {
    const code = (error as NodeJS.ErrnoException)?.code;
    return code === "ENOTFOUND" || code === "ENODATA";
}

async function checkSpamhaus(domain: string) {
    try {
        const answers = await dns.resolve4(`${domain}.dbl.spamhaus.org`);
        const errorCode = answers.find((answer) => answer.startsWith("127.255.255."));
        if (errorCode) {
            return {
                status: "unavailable" as const,
                detail: errorCode === "127.255.255.254"
                    ? "Spamhaus rejected the hosting DNS resolver as public. Check manually in Spamhaus Reputation Checker."
                    : "Spamhaus could not complete this lookup.",
                codes: answers,
            };
        }

        const listedCodes = answers.filter((answer) => SPAMHAUS_CODES[answer]);
        if (listedCodes.length) {
            return {
                status: "listed" as const,
                detail: listedCodes.map((code) => SPAMHAUS_CODES[code]).join(", "),
                codes: listedCodes,
            };
        }

        return {
            status: "unavailable" as const,
            detail: "Spamhaus returned an unrecognized response; this is not treated as a listing.",
            codes: answers,
        };
    } catch (error) {
        if (dnsNotFound(error)) {
            return { status: "not_listed" as const, detail: "No Spamhaus DBL listing found.", codes: [] as string[] };
        }
        return {
            status: "unavailable" as const,
            detail: error instanceof Error ? error.message : "Blacklist lookup failed.",
            codes: [] as string[],
        };
    }
}

function parentDomain(domain: string) {
    const labels = domain.split(".").filter(Boolean);
    return labels.length > 2 ? labels.slice(1).join(".") : domain;
}

async function checkDmarc(domain: string) {
    const candidates = Array.from(new Set([domain, parentDomain(domain)]));
    for (const candidate of candidates) {
        try {
            const records = await dns.resolveTxt(`_dmarc.${candidate}`);
            const value = records.map((parts) => parts.join("")).find((record) => /^v=DMARC1\s*;/i.test(record));
            if (value) {
                const policy = value.match(/(?:^|;)\s*p=([^;\s]+)/i)?.[1]?.toLowerCase() || "unknown";
                return { status: "present" as const, policy, host: `_dmarc.${candidate}` };
            }
        } catch (error) {
            if (!dnsNotFound(error)) {
                return { status: "unavailable" as const, policy: null, host: `_dmarc.${candidate}` };
            }
        }
    }
    return { status: "missing" as const, policy: null, host: `_dmarc.${domain}` };
}

async function loadResendDomains(): Promise<ResendDomain[]> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

    const listResponse = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
    });
    const listJson = await listResponse.json();
    if (!listResponse.ok) throw new Error(listJson?.message || "Could not load Resend domains.");

    const list = (listJson.data || listJson) as ResendDomain[];
    return Promise.all(list.map(async (domain) => {
        const detailResponse = await fetch(`https://api.resend.com/domains/${domain.id}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            cache: "no-store",
        });
        if (!detailResponse.ok) return domain;
        return await detailResponse.json() as ResendDomain;
    }));
}

export async function GET() {
    try {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const [portalResult, complaintResult, resendDomains] = await Promise.all([
            serverSupabase
                .from("domains")
                .select("id,domain_name,from_email,status,health_score,bounce_rate")
                .order("domain_name"),
            serverSupabase
                .from("send_logs")
                .select("domain_id")
                .eq("event", "complained")
                .gte("created_at", since),
            loadResendDomains(),
        ]);

        if (portalResult.error) throw portalResult.error;
        if (complaintResult.error) throw complaintResult.error;

        const portalDomains = (portalResult.data || []) as PortalDomain[];
        const portalByName = new Map(portalDomains.map((domain) => [domain.domain_name.toLowerCase(), domain]));
        const resendByName = new Map(resendDomains.map((domain) => [domain.name.toLowerCase(), domain]));
        const complaintCounts = new Map<string, number>();
        for (const row of complaintResult.data || []) {
            complaintCounts.set(row.domain_id, (complaintCounts.get(row.domain_id) || 0) + 1);
        }

        const names = Array.from(new Set([
            ...portalDomains.map((domain) => domain.domain_name.toLowerCase()),
            ...resendDomains.map((domain) => domain.name.toLowerCase()),
        ])).sort();

        const domains = await Promise.all(names.map(async (name) => {
            const portal = portalByName.get(name) || null;
            const resend = resendByName.get(name) || null;
            const [blacklist, dmarc] = await Promise.all([checkSpamhaus(name), checkDmarc(name)]);
            const essentialRecords = (resend?.records || []).filter((record) => record.record === "DKIM" || record.record === "SPF");
            const failedEssential = essentialRecords.filter((record) => record.status !== "verified");
            const complaints30d = portal ? complaintCounts.get(portal.id) || 0 : 0;
            const findings: string[] = [];
            let overall: "good" | "warning" | "blocked" = "good";

            if (!resend) {
                overall = "blocked";
                findings.push("This portal sender is not present in Resend.");
            } else if (resend.status === "failed" || failedEssential.length) {
                overall = "blocked";
                findings.push("Resend authentication is failing; do not send from this domain.");
            } else if (resend.status !== "verified") {
                overall = "warning";
                findings.push(`Resend status is ${resend.status}; review the failed optional records.`);
            }

            if (blacklist.status === "listed") {
                overall = "blocked";
                findings.push(`Spamhaus DBL listing: ${blacklist.detail}.`);
            } else if (blacklist.status === "unavailable" && overall === "good") {
                overall = "warning";
                findings.push("The Spamhaus lookup was unavailable, so blacklist status is unknown.");
            }

            if (dmarc.status === "missing") {
                if (overall === "good") overall = "warning";
                findings.push("No DMARC policy was found on the sender or parent domain.");
            } else if (dmarc.status === "unavailable") {
                if (overall === "good") overall = "warning";
                findings.push("DMARC could not be checked.");
            }

            if (portal?.status === "burned" || Number(portal?.bounce_rate || 0) >= 2 || complaints30d > 0) {
                overall = "blocked";
                if (portal?.status === "burned") findings.push("The portal has marked this sender as burned.");
                if (Number(portal?.bounce_rate || 0) >= 2) findings.push(`Portal bounce rate is ${portal?.bounce_rate}% (2% or higher).`);
                if (complaints30d > 0) findings.push(`${complaints30d} spam complaint(s) recorded in the last 30 days.`);
            } else if (portal && portal.health_score < 60) {
                if (overall === "good") overall = "warning";
                findings.push(`Internal delivery health is only ${portal.health_score}/100.`);
            }

            if (!findings.length) findings.push("Authentication and the available public checks passed.");

            return {
                domain: name,
                overall,
                configuredInPortal: Boolean(portal),
                portal: portal ? {
                    id: portal.id,
                    fromEmail: portal.from_email,
                    status: portal.status,
                    healthScore: portal.health_score,
                    bounceRate: Number(portal.bounce_rate || 0),
                    complaints30d,
                } : null,
                resend: resend ? {
                    status: resend.status,
                    region: resend.region || null,
                    records: resend.records || [],
                } : null,
                dmarc,
                blacklist,
                findings,
            };
        }));

        return NextResponse.json({
            checkedAt: new Date().toISOString(),
            summary: {
                total: domains.length,
                good: domains.filter((domain) => domain.overall === "good").length,
                warning: domains.filter((domain) => domain.overall === "warning").length,
                blocked: domains.filter((domain) => domain.overall === "blocked").length,
            },
            domains,
            note: "Public blacklist checks do not reveal Gmail or Microsoft reputation. Use Google Postmaster Tools and provider feedback for private reputation data.",
        }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : "Could not check domain reputation.",
        }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }
}
