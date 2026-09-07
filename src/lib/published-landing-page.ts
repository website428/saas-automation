import { supabase } from "@/lib/supabase";
import { LandingPage } from "@/lib/landing-pages";

export async function getPublishedLandingPage(slug: string): Promise<LandingPage | null> {
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!cleanSlug) return null;
    const { data: page, error } = await supabase.from("landing_pages").select("*").eq("slug", cleanSlug).eq("status", "published").maybeSingle();
    if (error || !page) return null;
    const { data: sections } = await supabase.from("landing_page_sections").select("id,page_id,section_type,sort_order,content").eq("page_id", page.id).order("sort_order");
    return { ...page, sections: sections || [] } as LandingPage;
}
