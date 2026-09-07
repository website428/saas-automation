export type LandingSectionType = "hero" | "features" | "proof" | "pricing" | "faq" | "cta" | "lead_form" | "logos" | "gallery" | "reviews";

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
  design_key?: LandingDesignKey;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
  sections: LandingSection[];
};

export type LandingTemplateKey = "ai-automation" | "ai-mvp" | "healthcare" | "webinar" | "case-study" | "agency-partner" | "waitlist" | "product-showcase" | "blank";

export type LandingDesignKey = "sage" | "midnight" | "violet" | "editorial" | "aurora";

export type LandingTemplate = {
  key: LandingTemplateKey;
  name: string;
  description: string;
  audience: string;
  design_key: LandingDesignKey;
};

export type LandingDesign = {
  key: LandingDesignKey;
  name: string;
  description: string;
};

export const landingDesigns: LandingDesign[] = [
  { key: "sage", name: "Sage light", description: "Clean, trustworthy and conversion-focused." },
  { key: "midnight", name: "Midnight product", description: "Dark SaaS interface style for technical products." },
  { key: "violet", name: "Violet modern", description: "Bold, friendly and energetic for AI and growth offers." },
  { key: "editorial", name: "Editorial cream", description: "Premium, calm and content-led for reports and case studies." },
  { key: "aurora", name: "Aurora gradient", description: "Bright, visual and launch-ready for events and waitlists." },
];

export const landingTemplates: LandingTemplate[] = [
  { key: "ai-automation", name: "AI automation audit", description: "Capture businesses that want to find practical AI opportunities.", audience: "Consulting and implementation leads", design_key: "sage" },
  { key: "ai-mvp", name: "AI MVP consultation", description: "Turn an AI product idea into a qualified discovery call.", audience: "Founders and product teams", design_key: "midnight" },
  { key: "healthcare", name: "Healthcare AI", description: "A trust-first page for healthcare operations and workflow automation.", audience: "Clinics, hospitals and health-tech teams", design_key: "editorial" },
  { key: "webinar", name: "Webinar registration", description: "Promote a live session and collect registrations in one focused page.", audience: "Event and education campaigns", design_key: "aurora" },
  { key: "case-study", name: "Case study download", description: "Use proof and a short form to distribute a case study or report.", audience: "High-intent content campaigns", design_key: "editorial" },
  { key: "agency-partner", name: "Agency partnership", description: "Attract agencies that need a reliable delivery partner.", audience: "Agencies and channel partners", design_key: "violet" },
  { key: "waitlist", name: "Waitlist / early access", description: "Build a list of people who want your upcoming product or offer.", audience: "Pre-launch and beta campaigns", design_key: "aurora" },
  { key: "product-showcase", name: "SaaS product showcase", description: "A full product-led page with outcomes, logos, screenshots, reviews and a conversion form.", audience: "SaaS product and Meta Ads campaigns", design_key: "midnight" },
  { key: "blank", name: "Blank campaign page", description: "Start with only the essentials and shape the page yourself.", audience: "Custom campaigns", design_key: "sage" },
];

export const sectionLabels: Record<LandingSectionType, string> = {
  hero: "Hero",
  features: "Features",
  proof: "Testimonial",
  pricing: "Pricing",
  faq: "FAQ",
  cta: "Call to action",
  lead_form: "Lead form",
  logos: "Social proof",
  gallery: "Screenshots",
  reviews: "Reviews",
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

function section(section_type: LandingSectionType, content: Record<string, unknown>, sort_order: number): LandingSection {
  return { section_type, sort_order, content };
}

function templateSections(templateKey: LandingTemplateKey): LandingSection[] {
  const leadForm = (heading: string, body: string, button_label: string): LandingSection => section("lead_form", { heading, body, button_label, success_message: "Thanks — we will be in touch shortly." }, 0);
  const faq = (items: Array<Record<string, string>>): LandingSection => section("faq", { heading: "Questions, answered.", items }, 0);
  const cta = (heading: string, body: string, button_label: string): LandingSection => section("cta", { heading, body, button_label, button_url: "#lead-form" }, 0);

  if (templateKey === "ai-automation") return [
    section("hero", { eyebrow: "AI AUTOMATION AUDIT", heading: "Find 3–5 processes AI can automate in your business.", body: "Get a practical starting point for reducing repetitive work, improving response time and creating a focused automation roadmap.", primary_cta_label: "Get my free AI audit", primary_cta_url: "#lead-form", secondary_cta_label: "What will I get?", secondary_cta_url: "#features" }, 0),
    section("features", { eyebrow: "A PRACTICAL FIRST STEP", heading: "Turn AI interest into a useful plan.", body: "Help your prospect understand exactly what happens after they raise their hand.", items: [{ title: "Find the best opportunities", body: "Identify repetitive, high-volume work where automation can create a visible result." }, { title: "Prioritise the roadmap", body: "Separate quick wins from complex projects and choose the right first workflow." }, { title: "Get next-step clarity", body: "Leave with an action plan your team can discuss, test and measure." }] }, 1),
    section("proof", { quote: "We stopped asking where AI could fit and found the first workflow worth improving.", name: "Your customer name", role: "Founder, Customer company" }, 2),
    leadForm("Get your AI automation audit", "Tell us about your team and the repetitive work you want to improve.", "Request my audit"),
    faq([{ question: "What happens after I submit?", answer: "We review your answers and follow up with a practical recommendation for the next step." }, { question: "Do I need technical knowledge?", answer: "No. Describe the business process in plain language and we will help translate it into an automation opportunity." }, { question: "Can we start small?", answer: "Yes. A focused pilot is usually the safest way to prove value before expanding." }]),
    cta("Ready to find your first automation win?", "Start with one process your team repeats every week.", "Request my audit"),
  ];

  if (templateKey === "ai-mvp") return [
    section("hero", { eyebrow: "AI PRODUCT DISCOVERY", heading: "Turn your AI product idea into a buildable MVP.", body: "Get a practical roadmap for scope, architecture, integrations and the fastest path to a useful first release.", primary_cta_label: "Plan my AI MVP", primary_cta_url: "#lead-form", secondary_cta_label: "See what is included", secondary_cta_url: "#features" }, 0),
    section("features", { eyebrow: "A CLEARER PATH TO LAUNCH", heading: "Replace guesswork with an implementation plan.", body: "Use the first conversation to turn a promising idea into decisions your team can act on.", items: [{ title: "Use-case validation", body: "Separate a valuable workflow from an idea that is expensive but difficult to adopt." }, { title: "Technical blueprint", body: "Map the data, model, integrations and security considerations before development starts." }, { title: "Launch scope", body: "Choose the smallest version that can create real user feedback and commercial proof." }] }, 1),
    section("proof", { quote: "The roadmap helped us stop debating possibilities and start building the right first version.", name: "Your customer name", role: "Founder, Customer company" }, 2),
    leadForm("Let us map your AI MVP", "Tell us what you are trying to build and where you are stuck.", "Request an MVP call"),
    faq([{ question: "Do I need a technical team?", answer: "No. Share the business problem and we will help translate it into a practical product plan." }, { question: "What will I receive?", answer: "A focused discovery conversation and recommended next steps for your MVP." }]),
    cta("Build the right first version.", "Start with a clear plan before you invest in development.", "Request an MVP call"),
  ];

  if (templateKey === "healthcare") return [
    section("hero", { eyebrow: "HEALTHCARE OPERATIONS", heading: "Practical AI automation for healthcare operations.", body: "Reduce repetitive administrative work while keeping your team in control of sensitive workflows and decisions.", primary_cta_label: "Explore healthcare automation", primary_cta_url: "#lead-form", secondary_cta_label: "See use cases", secondary_cta_url: "#features" }, 0),
    section("features", { eyebrow: "START WITH THE WORKFLOW", heading: "Improve the work around care.", body: "Focus on operational tasks where better information and less manual effort can make a measurable difference.", items: [{ title: "Documents and reporting", body: "Reduce time spent preparing recurring summaries, reports and internal updates." }, { title: "Patient communication", body: "Create more consistent follow-up workflows for approved, repeatable communications." }, { title: "Team operations", body: "Give staff clearer handoffs, reminders and visibility across routine processes." }] }, 1),
    section("proof", { quote: "We found a safe starting point for automation without asking the clinical team to change everything at once.", name: "Your customer name", role: "Operations leader, Customer company" }, 2),
    leadForm("Discuss your healthcare workflow", "Share the operational process you want to improve. We will suggest a sensible first step.", "Request a workflow review"),
    faq([{ question: "Is this medical advice?", answer: "No. This page is for operational automation and does not replace clinical judgement or professional advice." }, { question: "Can we start with one department?", answer: "Yes. A focused pilot is usually the best way to validate an automation safely." }]),
    cta("Make the next workflow easier.", "Start with one process your team repeats every week.", "Request a workflow review"),
  ];

  if (templateKey === "webinar") return [
    section("hero", { eyebrow: "LIVE SESSION", heading: "Build your first useful AI workflow.", body: "Join a practical session showing how to choose a workflow, design the automation and measure whether it is working.", primary_cta_label: "Reserve my seat", primary_cta_url: "#lead-form", secondary_cta_label: "What you will learn", secondary_cta_url: "#features" }, 0),
    section("features", { eyebrow: "IN THIS SESSION", heading: "Leave with a workflow you can act on.", body: "A focused, implementation-minded session for founders and operators.", items: [{ title: "Find the right use case", body: "Identify repetitive work where automation can create value quickly." }, { title: "Design the flow", body: "See the trigger, decisions, actions and handoff that make an automation reliable." }, { title: "Plan the next 7 days", body: "Turn the session into a small experiment with a clear owner and success metric." }] }, 1),
    section("proof", { quote: "The session gave our team a simple way to move from AI curiosity to a real workflow experiment.", name: "Your attendee name", role: "Operator, Customer company" }, 2),
    leadForm("Reserve your seat", "Add your details and we will send the session information.", "Register now"),
    faq([{ question: "Who should attend?", answer: "Founders, operators and team leads who want practical automation ideas." }, { question: "Will there be a recording?", answer: "Replace this answer with your real recording policy." }]),
    cta("Save your place.", "Bring one repetitive process and leave with a plan to improve it.", "Register now"),
  ];

  if (templateKey === "case-study") return [
    section("hero", { eyebrow: "CUSTOMER STORY", heading: "How a focused automation workflow created more room for growth.", body: "Read the practical story, the workflow changes and the lessons your team can apply next.", primary_cta_label: "Get the case study", primary_cta_url: "#lead-form", secondary_cta_label: "See the results", secondary_cta_url: "#features" }, 0),
    section("features", { eyebrow: "INSIDE THE STORY", heading: "Useful detail, not empty claims.", body: "Show prospects the starting point, the intervention and the outcome in a format they can trust.", items: [{ title: "The challenge", body: "Explain what was slow, manual or difficult before the project started." }, { title: "The workflow", body: "Show the practical process, tools and decisions that made the change work." }, { title: "The outcome", body: "Share the measurable result and what the team would do next." }] }, 1),
    section("proof", { quote: "The before-and-after workflow made it much easier for our team to decide where to start.", name: "Your customer name", role: "Founder, Customer company" }, 2),
    leadForm("Send me the case study", "Get the full story and the practical checklist.", "Download the case study"),
    cta("See what is possible for your team.", "Use the customer story as a starting point for your own workflow review.", "Download the case study"),
  ];

  if (templateKey === "agency-partner") return [
    section("hero", { eyebrow: "DELIVERY PARTNERSHIP", heading: "Deliver AI engineering without growing your internal team.", body: "Partner with a delivery team that can help you scope, build and support practical AI work for your clients.", primary_cta_label: "Discuss a partnership", primary_cta_url: "#lead-form", secondary_cta_label: "Why agencies work with us", secondary_cta_url: "#features" }, 0),
    section("features", { eyebrow: "A PARTNER YOUR CLIENTS CAN TRUST", heading: "Extend your capability without adding delivery risk.", body: "Keep the client relationship while adding experienced support where your team needs it.", items: [{ title: "White-label delivery", body: "Work together behind the scenes with clear ownership and communication." }, { title: "Faster proposals", body: "Turn early client conversations into credible scopes, estimates and next steps." }, { title: "Reliable execution", body: "Use a repeatable process for discovery, build, launch and improvement." }] }, 1),
    section("proof", { quote: "We can now say yes to AI projects with a delivery plan we are confident in.", name: "Your partner name", role: "Agency founder, Partner company" }, 2),
    leadForm("Explore a delivery partnership", "Tell us what your agency is trying to deliver and where support would help.", "Start a partner conversation"),
    cta("Add practical AI delivery to your offer.", "Start with one client use case or an upcoming proposal.", "Start a partner conversation"),
  ];

  if (templateKey === "waitlist") return [
    section("hero", { eyebrow: "EARLY ACCESS", heading: "Be first to use a simpler way to grow with AI.", body: "Join the early-access list for product updates, private demos and launch availability.", primary_cta_label: "Join the waitlist", primary_cta_url: "#lead-form", secondary_cta_label: "Why join early", secondary_cta_url: "#features" }, 0),
    section("features", { eyebrow: "EARLY ACCESS BENEFITS", heading: "Get closer to the product before launch.", body: "Give your first users a clear reason to raise their hand now.", items: [{ title: "Private preview", body: "See the product before wider availability." }, { title: "Founder feedback", body: "Help shape the workflows that matter most to your team." }, { title: "Launch updates", body: "Receive useful progress updates without noisy marketing." }] }, 1),
    leadForm("Join the early-access list", "Leave your details and we will let you know when the next access window opens.", "Join the waitlist"),
    cta("Want to be in the first group?", "Join the list and we will keep you updated.", "Join the waitlist"),
  ];

  if (templateKey === "product-showcase") return [
    section("hero", { eyebrow: "THE OPERATING SYSTEM FOR YOUR TEAM", heading: "Turn scattered work into one clear customer workflow.", body: "Give your team one place to capture demand, automate follow-up and see what needs attention next.", primary_cta_label: "Start for free", primary_cta_url: "#lead-form", secondary_cta_label: "Book a demo", secondary_cta_url: "#lead-form" }, 0),
    section("logos", { heading: "TRUSTED BY TEAMS BUILDING WHAT IS NEXT", items: [{ name: "Northstar" }, { name: "Orbit" }, { name: "Vertex" }, { name: "Signal" }, { name: "Atlas" }] }, 1),
    section("features", { eyebrow: "ONE PLATFORM, CLEARER OUTCOMES", heading: "Everything your team needs to move faster.", body: "Organise the work, automate the repetitive steps and give every stakeholder a better view of progress.", items: [{ title: "Capture every opportunity", body: "Bring requests, leads and conversations into one reliable workflow." }, { title: "Automate the busywork", body: "Trigger the right follow-up and handoff without manual reminders." }, { title: "Measure what matters", body: "See activity, outcomes and bottlenecks before they become problems." }] }, 2),
    section("gallery", { eyebrow: "A CLEARER WORKSPACE", heading: "Show the product in the flow of work.", body: "Replace these placeholders with your own dashboard screenshots.", items: [{ image_url: "", alt: "Main product dashboard", caption: "Your main workspace" }, { image_url: "", alt: "Automation workflow", caption: "Your automation workflow" }] }, 3),
    section("reviews", { eyebrow: "LOVED BY OPERATORS", heading: "A better way to get work done.", body: "Use real customer words to make the value concrete.", items: [{ quote: "We finally know what needs attention and what can run automatically.", name: "Customer name", role: "Head of Operations" }, { quote: "The team adopted it quickly because the next step is always obvious.", name: "Customer name", role: "Founder" }, { quote: "We replaced three disconnected processes with one simple workflow.", name: "Customer name", role: "Revenue Lead" }] }, 4),
    leadForm("See how it could work for your team", "Tell us what you want to improve and we will show you the most useful starting point.", "Request a demo"),
    faq([{ question: "How quickly can we get started?", answer: "Replace this with your real onboarding timeline." }, { question: "Can it connect to our existing tools?", answer: "Replace this with your current integrations and implementation details." }]),
    cta("Make your next workflow simpler.", "Start with one team, one process and one measurable result.", "Request a demo"),
  ];

  if (templateKey === "blank") return [
    section("hero", { eyebrow: "YOUR CAMPAIGN", heading: "Your offer should make the next step obvious.", body: "Explain the result you create, then give the right visitor one simple action.", primary_cta_label: "Get started", primary_cta_url: "#lead-form", secondary_cta_label: "Learn more", secondary_cta_url: "#lead-form" }, 0),
    leadForm("Take the next step", "Tell us a little about what you need.", "Send request"),
  ];

  return defaultSections();
}

export function newLandingPage(templateKey: LandingTemplateKey = "ai-automation"): LandingPage {
  const template = landingTemplates.find((item) => item.key === templateKey) || landingTemplates[0];
  const slug = `${template.key}-${Date.now().toString(36)}`;
  return {
    name: template.name,
    slug,
    status: "draft",
    seo_title: template.name,
    seo_description: template.description,
    design_key: template.design_key,
    sections: templateSections(template.key),
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
