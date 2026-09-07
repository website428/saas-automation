import type { Metadata } from "next";
import GrowthOfferPage from "@/components/growth-offer-page";

export const metadata: Metadata = { title: "Free Healthcare AI Audit | Finasoft Ventures", description: "Identify practical AI opportunities across healthcare reporting, documents, scheduling and operations." };
export default function HealthcareAiPage() { return <GrowthOfferPage variant="healthcare" />; }
