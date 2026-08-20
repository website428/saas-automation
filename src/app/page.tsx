import type { Metadata } from "next";
import LandingPage from "@/components/landing-page";

export const metadata: Metadata = {
  title: "FinModel Pro — Build investor-ready financial models faster",
  description: "Create, stress-test, and share professional financial models without spending weeks in spreadsheets.",
};

export default function Home() {
  return <LandingPage />;
}
