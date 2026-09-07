import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/server-supabase";

function safeFileName(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "asset";
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
        if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Only image files are supported." }, { status: 400 });
        if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Image must be smaller than 5 MB." }, { status: 400 });
        const path = `landing-pages/${crypto.randomUUID()}-${safeFileName(file.name)}`;
        const { error } = await serverSupabase.storage.from("landing-assets").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        const { data } = serverSupabase.storage.from("landing-assets").getPublicUrl(path);
        return NextResponse.json({ ok: true, url: data.publicUrl });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not upload image." }, { status: 500 });
    }
}
