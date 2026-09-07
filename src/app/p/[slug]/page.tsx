import { notFound } from "next/navigation";
import PublicLandingPage from "@/components/public-landing-page";
import { getPublishedLandingPage } from "@/lib/published-landing-page";

export const dynamic = "force-dynamic";

export default async function PublishedLandingPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const page = await getPublishedLandingPage(slug);
    if (!page) notFound();
    return <PublicLandingPage page={page} />;
}
