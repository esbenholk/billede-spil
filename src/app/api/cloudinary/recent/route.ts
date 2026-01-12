// app/api/images/route.ts
import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

type ImageItem = {
  // basics
  url: string;
  publicId: string;
  assetId?: string | null;
  width?: number | null;
  height?: number | null;
  folder?: string | null;
  createdAt?: string | null;

  // tags
  tags: string[];

  // human-facing
  title: string | null;
  alt: string | null;

  // AI/extra context
  aiTitle: string | null;
  aiStyle: string | null;
  aiTrend: string | null;
  aiSoMeType: string | null; // social media type
  aiVibe: string | null; // CSV string you stored
  aiObjects: string | null; // CSV (first 5) you stored
  community: string | null;
  parentIds: string | null;
  aiPeople: string[] | null;
};


let cloudinaryfolder = "imageEcology";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const skip = parseInt(url.searchParams.get("skip") || "0", 10);
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);
  const folder = url.searchParams.get("folder") || cloudinaryfolder;

  // helper to pull from camelCase or snake_case
  const pick = (obj: any, kCamel: string, kSnake: string) =>
    obj?.[kCamel] ?? obj?.[kSnake] ?? null;

  try {
    const res = await cloudinary.search
      .expression(`folder="${folder}"`)
      .sort_by("created_at", "desc")
      .with_field("context")
      .with_field("metadata")
      .with_field("tags")
      .max_results(skip + limit)
      .execute();

    const items: ImageItem[] = (res.resources || [])
      .slice(skip, skip + limit)
      .map((r: any) => {
        const cx = r.context?.custom ?? r.context ?? {}; // where your upload put context
        const md = r.metadata ?? {}; // if you later move things to metadata

        // Prefer values in context, fall back to metadata if present
        const aiTitle =
          pick(cx, "aiTitle", "ai_title") ?? pick(md, "aiTitle", "ai_title");
        const aiStyle =
          pick(cx, "aiStyle", "ai_style") ?? pick(md, "aiStyle", "ai_style");
        const aiTrend =
          pick(cx, "aiTrend", "ai_trend") ?? pick(md, "aiTrend", "ai_trend");
        const aiSoMeType =
          pick(cx, "aiSoMeType", "ai_so_me_type") ??
          pick(md, "aiSoMeType", "ai_so_me_type");
        const aiVibe =
          pick(cx, "aiVibe", "ai_vibe") ?? pick(md, "aiVibe", "ai_vibe");
        const aiObjects =
          pick(cx, "aiObjects", "ai_objects") ??
          pick(md, "aiObjects", "ai_objects");
        const community =
          pick(cx, "community", "community") ??
          pick(md, "community", "community");
        const parentIds =
          pick(cx, "parentIds", "parentIds") ??
          pick(md, "parentIds", "parentIds");

        const aiPeople =
          pick(cx, "aiPeople", "ai_people") ??
          pick(md, "aiPeople", "ai_people");

        const caption =
          pick(cx, "caption", "caption") ?? pick(md, "caption", "caption");
        const alt =
          pick(cx, "alt", "alt") ?? pick(md, "description", "description");

        // human-facing title fallback order
        const title =
          caption ??
          pick(md, "title", "title") ??
          r.public_id?.split("/").pop() ??
          "Untitled";

        // Prefer secure url; generate if missing (e.g., for derived types)
        const secureUrl =
          r.secure_url ||
          cloudinary.url(r.public_id, {
            secure: true,
            resource_type: r.resource_type || "image",
            type: r.type || "upload",
          });

        return {
          // basics
          url: secureUrl,
          publicId: r.public_id,
          assetId: r.asset_id ?? null,
          width: r.width ?? null,
          height: r.height ?? null,
          folder: r.folder ?? null,
          createdAt: r.created_at ?? null,

          // tags (Cloudinary returns an array when set via `tags`)
          tags: Array.isArray(r.tags) ? r.tags : [],

          // human-facing
          title,
          alt: alt ?? null,

          // AI/extra context
          aiTitle: aiTitle ?? null,
          aiStyle: aiStyle ?? null,
          aiTrend: aiTrend ?? null,
          aiPeople: aiPeople ?? null,
          aiSoMeType: aiSoMeType ?? null,
          aiVibe: aiVibe ?? null,
          aiObjects: aiObjects ?? null,
          community: community ?? null,
          parentIds: parentIds ?? null,
        };
      });

    return NextResponse.json(items);
  } catch (error) {
    console.error("Cloudinary fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch images" },
      { status: 500 }
    );
  }
}
