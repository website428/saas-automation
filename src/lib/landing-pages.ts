export type LandingSectionType = "hero" | "features" | "proof" | "pricing" | "faq" | "cta" | "lead_form" | "logos";

export type LandingSection = {
  id?: string;
  section_type: LandingSectionType;
  sort_order: number;
  content: Record<string, unknown>;
};

export type LandingPage = {
  id?: string;
  name: string;
  slug: string;
  status: "draft" | "published" | "archived";
  seo_title: string;
  seo_description: string;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
  sections: LandingSection[];
};

export const sectionLabels: Record<LandingSectionType, string> = {
  hero: "Hero",
  features: "Features",
  proof: "Testimonial",
  pricing: "Pricing",
  faq: "FAQ",
  cta: "Call to action",
  lead_form: "Lead form",
  logos: "Social proof",
};

export function defaultSections(): LandingSection[] {
  return [
    {
      section_type: "hero",
      sort_order: 0,
      content: {
        eyebrow: "BUILT FOR BUSY TEAMS",
        heading: "Turn more attention into qualified pipeline.",
        body: "A focused landing page for your next campaign, connected to your existing lead and email automation.",
        primary_cta_label: "Get started",
        primary_cta_url: "#lead-form",
        secondary_cta_label: "See how it works",
        secondary_cta_url: "#features",
      },
    },
    {
      section_type: "features",
      sort_order: 1,
      content: {
        eyebrow: "WHY IT WORKS",
        heading: "Make the next step obvious.",
        body: "Explain the outcome, prove the value, and give the right people a simple way to respond.",
        items: [
          { title: "Clear positioning", body: "Lead with one valuable outcome instead of a list of vague features." },
          { title: "Built for conversion", body: "Keep the page focused with proof, a strong CTA, and a short form." },
          { title: "Connected follow-up", body: "Every form submission can enter your contacts and automation workflow." },
        ],
      },
    },
    {
      section_type: "proof",
      sort_order: 2,
      content: {
        quote: "We finally had a page that explained the offer clearly and gave sales a useful lead signal.",
        name: "Your customer name",
        role: "Founder, Customer company",
      },
    },
    {
      section_type: "lead_form",
      sort_order: 3,
      content: {
        heading: "Get the next step.",
        body: "Leave your details and we will follow up with something useful.",
        button_label: "Send request",
        success_message: "Thanks — we will be in touch shortly.",
      },
    },
    {
      section_type: "faq",
      sort_order: 4,
      content: {
        heading: "Questions, answered.",
        items: [
          { question: "Who is this for?", answer: "Replace this with the audience your offer is designed for." },
          { question: "What happens after I submit?", answer: "Replace this with your real follow-up process and expected response time." },
        ],
      },
    },
    {
      section_type: "cta",
      sort_order: 5,
      content: {
        heading: "Ready to take the next step?",
        body: "Give the right visitor one clear action to take.",
        button_label: "Get started",
        button_url: "#lead-form",
      },
    },
  ];
}

export function newLandingPage(): LandingPage {
  return {
    name: "New campaign page",
    slug: "new-campaign-page",
    status: "draft",
    seo_title: "New campaign page",
    seo_description: "A focused campaign landing page.",
    sections: defaultSections(),
  };
}

export function asText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function asItems(value: unknown): Array<Record<string, string>> {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && typeof item === "object").map(item => {
    const record = item as Record<string, unknown>;
    return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, asText(entry)]));
  });
}
