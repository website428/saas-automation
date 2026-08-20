/**
 * Warmup Engine — Adaptive Domain Warmup Algorithm
 * 
 * Controls how many emails each domain can send per day,
 * gradually increasing volume while monitoring health.
 */

export interface WarmupConfig {
    baseDailyLimit: number;
    growthFactor: number;
    maxDailyLimit: number;
    weekendReduction: number;
    minGapMinutes: number;
}

export const DEFAULT_WARMUP_CONFIG: WarmupConfig = {
    baseDailyLimit: 20,
    growthFactor: 1.20,
    maxDailyLimit: 100,
    weekendReduction: 0.5,
    minGapMinutes: 2,
};

/**
 * Calculate the daily send limit for a domain based on its warmup day.
 * Formula: min(20 × 1.20^(day-1), 100)
 * 
 * Day 1: 20  Day 7: 59  Day 10: 100 (account cap)
 */
export function calculateDailyLimit(
    warmupDay: number,
    config: WarmupConfig = DEFAULT_WARMUP_CONFIG
): number {
    const rawLimit = config.baseDailyLimit * Math.pow(config.growthFactor, warmupDay - 1);
    return Math.max(5, Math.min(config.maxDailyLimit, Math.floor(rawLimit)));
}

/**
 * Adaptive growth factor based on bounce rate.
 * Lower bounce = faster growth. Higher bounce = slowdown or pause.
 */
export function getAdaptiveGrowthFactor(bounceRate: number): number {
    if (bounceRate < 0.02) return 1.2; // Healthy — accelerate
    if (bounceRate < 0.05) return 1.1; // Caution — maintain
    if (bounceRate < 0.08) return 0.9; // Warning — slow down
    return 0; // Critical — pause
}

/**
 * Calculate health score (0–100) for a domain.
 * Weighted average of bounce rate, open rate, and complaints.
 */
export function calculateHealthScore(metrics: {
    bounceRate: number;
    openRate: number;
    complaintRate: number;
}): number {
    const bounceScore = Math.max(0, 100 - metrics.bounceRate * 1000); // 0% = 100, 10% = 0
    const openScore = Math.min(100, metrics.openRate * 200); // 50%+ = 100
    const complaintScore = Math.max(0, 100 - metrics.complaintRate * 10000); // 0% = 100

    return Math.round(bounceScore * 0.4 + openScore * 0.25 + complaintScore * 0.35);
}

/**
 * Determine domain status based on health score.
 */
export function getDomainStatus(
    healthScore: number
): "healthy" | "warning" | "danger" | "critical" {
    if (healthScore >= 80) return "healthy";
    if (healthScore >= 60) return "warning";
    if (healthScore >= 40) return "danger";
    return "critical";
}

/**
 * Check if today is a weekend (Saturday or Sunday).
 */
export function isWeekend(date: Date = new Date()): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
}

/**
 * Get the adjusted daily limit accounting for weekends.
 */
export function getAdjustedDailyLimit(
    warmupDay: number,
    bounceRate: number,
    config: WarmupConfig = DEFAULT_WARMUP_CONFIG
): number {
    const adaptiveGrowth = getAdaptiveGrowthFactor(bounceRate);
    if (adaptiveGrowth === 0) return 0; // Domain paused

    const adaptiveConfig = { ...config, growthFactor: adaptiveGrowth };
    let limit = calculateDailyLimit(warmupDay, adaptiveConfig);

    if (isWeekend()) {
        limit = Math.floor(limit * config.weekendReduction);
    }

    return limit;
}

/**
 * Generate scheduled send times for a batch of emails.
 * Distributes them throughout business hours with random gaps.
 */
export function generateSendSchedule(
    count: number,
    startDate: Date,
    minGapMinutes: number = 2,
    maxGapMinutes: number = 15
): Date[] {
    const schedule: Date[] = [];
    let currentTime = new Date(startDate);

    // Start at 9 AM if before business hours
    if (currentTime.getHours() < 9) {
        currentTime.setHours(9, 0, 0, 0);
    }

    for (let i = 0; i < count; i++) {
        schedule.push(new Date(currentTime));

        // Random gap between min and max
        const gapMinutes =
            minGapMinutes + Math.random() * (maxGapMinutes - minGapMinutes);
        currentTime = new Date(currentTime.getTime() + gapMinutes * 60 * 1000);

        // If past 6 PM, move to next day 9 AM
        if (currentTime.getHours() >= 18) {
            currentTime.setDate(currentTime.getDate() + 1);
            currentTime.setHours(9, 0, 0, 0);

            // Skip weekends
            while (isWeekend(currentTime)) {
                currentTime.setDate(currentTime.getDate() + 1);
            }
        }
    }

    return schedule;
}

/**
 * Estimate total days to send all emails across all domains.
 */
export function estimateCompletionDays(
    totalEmails: number,
    domainCount: number,
    config: WarmupConfig = DEFAULT_WARMUP_CONFIG
): number {
    let totalSent = 0;
    let day = 0;

    while (totalSent < totalEmails && day < 60) {
        const dailyPerDomain = calculateDailyLimit(day, config);
        const dailyTotal = dailyPerDomain * domainCount;
        totalSent += dailyTotal;
        day++;
    }

    return day;
}

/**
 * Format estimated completion date from today.
 */
export function getEstimatedCompletionDate(
    totalEmails: number,
    domainCount: number,
    config: WarmupConfig = DEFAULT_WARMUP_CONFIG
): Date {
    const days = estimateCompletionDays(totalEmails, domainCount, config);
    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + days);
    return completionDate;
}
