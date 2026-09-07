import type { Metadata } from "next";
import GrowthOfferPage from "@/components/growth-offer-page";

export const metadata: Metadata = { title: "Free AI MVP Architecture Review | Finasoft Ventures", description: "Turn an AI SaaS idea into a focused, buildable MVP architecture and delivery plan." };
export default function AiMvpPage() { return <GrowthOfferPage variant="mvp" />; }

