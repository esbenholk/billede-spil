// app/api/images/route.ts
import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

type ImageDescriptor = {
  title: string | null;
  caption: string | null;
  altText: string | null;

  so_me_type: string | null;
  trend: string | null;
  feeling: string | null;

  subject: string | null;
  setting: string | null;
  medium: string | null;
  realism: string | null;
  lighting: string | null;
  palette: string | null;
  composition: string | null;

  style: string | null;

  vibe: string[];
  objects: string[];
  people: string[];
  scenes: string[];
  must_keep: string[];
};

type ImageItem = {
  url: string;
  publicId: string;
  assetId?: string | null;
  width?: number | null;
  height?: number | null;
  folder?: string | null;
  createdAt?: string | null;

  tags: string[];

  title: string | null;
  alt: string | null;

  // ✅ new
  descriptor: ImageDescriptor;

  // legacy (optional)
  aiTitle: string | null;
  aiStyle: string | null;
  aiTrend: string | null;
  aiSoMeType: string | null;
  aiVibe: string | null;
  aiObjects: string | null;
  aiPeople: string | null;
  community: string | null;
  parentIds: string | null;
};

const cloudinaryfolder = "imageEcology";

const pick = (obj: any, ...keys: string[]) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
};

const csvToArr = (v: any) => {
  if (!v) return [];
  if (Array.isArray(v))
    return v
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  const s = String(v).trim();
  if (!s) return [];
  // try JSON array first (some of your older fields)
  if (
    (s.startsWith("[") && s.endsWith("]")) ||
    (s.startsWith("{") && s.endsWith("}"))
  ) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed))
        return parsed
          .map(String)
          .map((x) => x.trim())
          .filter(Boolean);
    } catch {}
  }
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const skip = parseInt(url.searchParams.get("skip") || "0", 10);
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);
  const folder = url.searchParams.get("folder") || cloudinaryfolder;

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
        const cx = r.context?.custom ?? r.context ?? {};
        const md = r.metadata ?? {};

        // Human-facing fields
        const caption = pick(cx, "caption", "Caption") ?? pick(md, "caption");
        const alt =
          pick(cx, "alt", "altText", "alt_text") ??
          pick(md, "alt", "altText", "alt_text", "description");

        const title =
          caption ??
          pick(md, "title") ??
          r.public_id?.split("/").pop() ??
          "Untitled";

        // ✅ Pull ALL AI fields (camel + snake)
        const ai_title =
          pick(cx, "aiTitle", "ai_title") ?? pick(md, "aiTitle", "ai_title");
        const ai_caption =
          pick(cx, "aiCaption", "ai_caption") ??
          pick(md, "aiCaption", "ai_caption");
        const ai_style =
          pick(cx, "aiStyle", "ai_style") ?? pick(md, "aiStyle", "ai_style");
        const ai_trend =
          pick(cx, "aiTrend", "ai_trend") ?? pick(md, "aiTrend", "ai_trend");
        const ai_so_me_type =
          pick(cx, "aiSoMeType", "ai_so_me_type") ??
          pick(md, "aiSoMeType", "ai_so_me_type");
        const ai_feeling =
          pick(cx, "aiFeeling", "ai_feeling") ??
          pick(md, "aiFeeling", "ai_feeling");

        const ai_subject =
          pick(cx, "aiSubject", "ai_subject") ??
          pick(md, "aiSubject", "ai_subject");
        const ai_setting =
          pick(cx, "aiSetting", "ai_setting") ??
          pick(md, "aiSetting", "ai_setting");
        const ai_medium =
          pick(cx, "aiMedium", "ai_medium") ??
          pick(md, "aiMedium", "ai_medium");
        const ai_realism =
          pick(cx, "aiRealism", "ai_realism") ??
          pick(md, "aiRealism", "ai_realism");
        const ai_lighting =
          pick(cx, "aiLighting", "ai_lighting") ??
          pick(md, "aiLighting", "ai_lighting");
        const ai_palette =
          pick(cx, "aiPalette", "ai_palette") ??
          pick(md, "aiPalette", "ai_palette");
        const ai_composition =
          pick(cx, "aiComposition", "ai_composition") ??
          pick(md, "aiComposition", "ai_composition");

        const ai_vibe =
          pick(cx, "aiVibe", "ai_vibe") ?? pick(md, "aiVibe", "ai_vibe");
        const ai_objects =
          pick(cx, "aiObjects", "ai_objects") ??
          pick(md, "aiObjects", "ai_objects");
        const ai_people =
          pick(cx, "aiPeople", "ai_people") ??
          pick(md, "aiPeople", "ai_people");
        const ai_scenes =
          pick(cx, "aiScenes", "ai_scenes") ??
          pick(md, "aiScenes", "ai_scenes");
        const ai_must_keep =
          pick(cx, "aiMustKeep", "ai_must_keep") ??
          pick(md, "aiMustKeep", "ai_must_keep");

        const community = pick(cx, "community") ?? pick(md, "community");
        const parentIds =
          pick(cx, "parentIds", "parent_ids") ??
          pick(md, "parentIds", "parent_ids");

        const secureUrl =
          r.secure_url ||
          cloudinary.url(r.public_id, {
            secure: true,
            resource_type: r.resource_type || "image",
            type: r.type || "upload",
          });

        const descriptor: ImageDescriptor = {
          title: ai_title ?? null,
          caption: ai_caption ?? null,
          altText: (alt as string | null) ?? null,

          so_me_type: ai_so_me_type ?? null,
          trend: ai_trend ?? null,
          feeling: ai_feeling ?? null,

          subject: ai_subject ?? null,
          setting: ai_setting ?? null,
          medium: ai_medium ?? null,
          realism: ai_realism ?? null,
          lighting: ai_lighting ?? null,
          palette: ai_palette ?? null,
          composition: ai_composition ?? null,

          style: ai_style ?? null,

          vibe: csvToArr(ai_vibe),
          objects: csvToArr(ai_objects),
          people: csvToArr(ai_people),
          scenes: csvToArr(ai_scenes),
          must_keep: csvToArr(ai_must_keep),
        };

        return {
          url: secureUrl,
          publicId: r.public_id,
          assetId: r.asset_id ?? null,
          width: r.width ?? null,
          height: r.height ?? null,
          folder: r.folder ?? null,
          createdAt: r.created_at ?? null,

          tags: Array.isArray(r.tags) ? r.tags : [],

          title,
          alt: (alt as string | null) ?? null,

          descriptor,

          // legacy mirrors
          aiTitle: ai_title ?? null,
          aiStyle: ai_style ?? null,
          aiTrend: ai_trend ?? null,
          aiSoMeType: ai_so_me_type ?? null,
          aiVibe: ai_vibe ?? null,
          aiObjects: ai_objects ?? null,
          aiPeople: ai_people ?? null,

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
