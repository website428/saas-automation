import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PublicLandingPage from "@/components/public-landing-page";
import { getPublishedLandingPage } from "@/lib/published-landing-page";

export const metadata: Metadata = {
  title: "Landing page builder",
  description: "Create and publish campaign landing pages connected to your marketing automation.",
};

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: slug } = await searchParams;
  if (!slug) redirect("/dashboard");
  const page = await getPublishedLandingPage(slug);
  if (!page) return <main style={{ padding: 50, fontFamily: "Arial, sans-serif" }}><h1>Landing page not found</h1><p>This page may still be a draft or the builder migration has not been applied.</p></main>;
  return <PublicLandingPage page={page} />;
}
