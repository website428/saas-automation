import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PublicLandingPage from "@/components/public-landing-page";
import { LandingPage } from "@/lib/landing-pages";

export const metadata: Metadata = {
  title: "Landing page builder",
  description: "Create and publish campaign landing pages connected to your marketing automation.",
};

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: slug } = await searchParams;
  if (!slug) redirect("/dashboard");
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const { data: page, error } = await supabase.from("landing_pages").select("*").eq("slug", cleanSlug).eq("status", "published").maybeSingle();
  if (error || !page) return <main style={{ padding: 50, fontFamily: "Arial, sans-serif" }}><h1>Landing page not found</h1><p>This page may still be a draft or the builder migration has not been applied.</p></main>;
  const { data: sections } = await supabase.from("landing_page_sections").select("id,page_id,section_type,sort_order,content").eq("page_id", page.id).order("sort_order");
  return <PublicLandingPage page={{ ...page, sections: sections || [] } as LandingPage} />;
}
