import type { Metadata } from "next";
import GrowthOfferPage from "@/components/growth-offer-page";

export const metadata: Metadata = { title: "Free AI Automation Audit | Finasoft Ventures", description: "Find practical workflows AI can automate and estimate the potential monthly savings." };
export default function AiAutomationPage() { return <GrowthOfferPage variant="automation" />; }

