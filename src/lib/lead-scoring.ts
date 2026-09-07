export type LeadQualificationInput = {
  email?: string;
  company_website?: string;
  industry?: string;
  employee_count?: number;
  requirement?: string;
  problem_statement?: string;
  budget_band?: string;
  timeline?: string;
  decision_maker?: boolean;
  repetitive_workflows?: number;
  manual_hours_weekly?: number;
  hourly_cost?: number;
};

const personalEmailDomains = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
  "proton.me", "protonmail.com", "rediffmail.com",
]);

function safeNumber(value: unknown, min = 0, max = 1_000_000) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : 0;
}

export function isBusinessEmail(email = "") {
  const domain = email.trim().toLowerCase().split("@")[1] || "";
  return Boolean(domain && !personalEmailDomains.has(domain));
}

export function calculateLeadQualification(input: LeadQualificationInput) {
  const hours = safeNumber(input.manual_hours_weekly, 0, 10_000);
  const hourlyCost = safeNumber(input.hourly_cost, 0, 100_000);
  const workflows = safeNumber(input.repetitive_workflows, 0, 100);
  const monthlyManualCost = Math.round(hours * hourlyCost * 4.33);
  const automationRate = workflows >= 5 ? 0.55 : workflows >= 3 ? 0.45 : 0.35;
  const estimatedMonthlySavings = Math.round(monthlyManualCost * automationRate);

  let score = 0;
  if (["3l-10l", "10l-plus"].includes(input.budget_band || "")) score += 30;
  else if (input.budget_band === "1l-3l") score += 18;
  else if (input.budget_band === "50k-1l") score += 8;
  if (["immediately", "under-30-days"].includes(input.timeline || "")) score += 20;
  else if (input.timeline === "1-3-months") score += 10;
  if (input.decision_maker) score += 15;
  if (isBusinessEmail(input.email)) score += 10;
  if ((input.problem_statement || "").trim().length >= 40) score += 10;
  if ((input.company_website || "").trim().length >= 6) score += 10;
  if (["healthcare", "saas", "agency", "startup", "pharma", "diagnostics"].includes((input.industry || "").toLowerCase())) score += 5;
  score = Math.min(100, score);

  const temperature = score >= 70 ? "hot" : score >= 40 ? "qualified" : "nurture";
  const potential = estimatedMonthlySavings >= 300_000 || workflows >= 5 ? "high" : estimatedMonthlySavings >= 75_000 || workflows >= 3 ? "medium" : "emerging";
  const pipelineStage = temperature === "hot" ? "qualified" : temperature === "qualified" ? "contacted" : "new";

  return { score, temperature, potential, pipelineStage, monthlyManualCost, estimatedMonthlySavings, businessEmail: isBusinessEmail(input.email) };
}

export function qualificationEvent(temperature: string) {
  return temperature === "hot" ? "hot_lead" : temperature === "qualified" ? "qualified_lead" : "lead_created";
}
