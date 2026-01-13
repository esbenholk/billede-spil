import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function dedupLower(arr: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of arr) {
    const k = (t || "").trim().toLowerCase();
    if (!k) continue;
    if (!seen.has(k)) {
      seen.add(k);
      out.push((t || "").trim());
    }
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const {
      imageUrl,
      title = "",
      tags = "",
      parentIds,
      community,
    } = await request.json();

    // 1) Upload to Cloudinary
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: "imageEcology",
      context: {
        alt: title,
        caption: title,
        parentIds: parentIds != null ? String(parentIds) : "",
        community: community ?? "",
      },
      moderation:
        "aws_rek:" +
        "explicit_nudity:0.7:" +
        "hate_symbols:0.6:" +
        "suggestive:ignore:" +
        "violence:ignore:" +
        "visually_disturbing:ignore:" +
        "rude_gestures:ignore:" +
        "drugs:ignore:" +
        "tobacco:ignore:" +
        "alcohol:ignore:" +
        "gambling:ignore",
    });

    const moderationArr = (result as any).moderation as
      | { status: string; kind: string; info?: Record<string, any> }[]
      | undefined;

    const wasRejected = moderationArr?.some(
      (m) => m.status === "rejected" && m.kind.startsWith("aws_rek")
    );

    if (wasRejected) {
      return NextResponse.json(
        { error: "image does not adhere to our policy" },
        { status: 500 }
      );
    }

    // 2) Vision -> structured descriptor (schema locked)
    const schema = {
      name: "ImageDescriptor",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          caption: { type: "string" },
          altText: { type: "string" },
          so_me_type: { type: "string" },
          trend: { type: "string" },
          feeling: { type: "string" },

          // High-value structured fields for remixing
          subject: { type: "string" },
          setting: { type: "string" },
          medium: { type: "string" }, // photograph / 3D render / illustration / etc.
          realism: { type: "string" }, // photorealistic / stylized / cartoon / etc.
          lighting: { type: "string" },
          palette: { type: "string" },
          composition: { type: "string" },
          style: { type: "string" }, // keep your existing “style string” too

          tags: {
            type: "array",
            items: { type: "string" },
            minItems: 0,
            maxItems: 16,
          },
          vibe: {
            type: "array",
            items: { type: "string" },
            minItems: 0,
            maxItems: 10,
          },
          objects: {
            type: "array",
            items: { type: "string" },
            minItems: 0,
            maxItems: 12,
          },
          scenes: {
            type: "array",
            items: { type: "string" },
            minItems: 0,
            maxItems: 5,
          },
          people: {
            type: "array",
            items: { type: "string" },
            minItems: 0,
            maxItems: 6,
          },

          // Anchors
          must_keep: {
            type: "array",
            items: { type: "string" },
            minItems: 3,
            maxItems: 10,
          },
        },
        required: [
          "title",
          "caption",
          "altText",
          "so_me_type",
          "trend",
          "feeling",
          "subject",
          "setting",
          "medium",
          "realism",
          "lighting",
          "palette",
          "composition",
          "style",
          "tags",
          "vibe",
          "objects",
          "scenes",
          "people",
          "must_keep",
        ],
      },
    } as const;

    const visionPrompt = `
You are describing an image for storage + remixing.
Return JSON that matches the provided schema EXACTLY.

Rules:
- "title": <= 7 words, aligned with user title "${title}" (refine if needed).
- "caption": <= 2 sentences.
- "altText": <= 15 words, neutral literal description.
- "subject": 3-10 words describing the main subject.
- "setting": concise environment description.
- "must_keep": 3-10 concrete anchors that must survive remixing (objects / wardrobe / props / defining features).
- "medium"/"realism"/"lighting"/"palette"/"composition": short, remixable phrases.
- "style": a reusable prompt-style string combining medium/realism/lighting/palette/composition succinctly.
- If no people, "people" must be [].
- If unknown trend, "trend" = "" (but keep the key).
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: "json_schema", json_schema: schema },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: visionPrompt },
            { type: "image_url", image_url: { url: result.secure_url } },
          ],
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const ai = JSON.parse(raw) as any;

    // 3) Merge tags for Cloudinary
    const mergedTags = dedupLower([
      ...(ai.tags || []),
      ...(ai.vibe || []),
      ...(ai.objects || []),
      ...(ai.must_keep || []),
      ...(tags ? String(tags).split(",") : []),
    ]).slice(0, 40);

    // 4) Save descriptor back to Cloudinary context
    await cloudinary.uploader.explicit(result.public_id, {
      type: "upload",
      tags: mergedTags.join(","),
      context: {
        caption: title,
        alt: ai.altText,

        community: community ?? "",
        parentIds: parentIds != null ? String(parentIds) : "",

        // Your original fields
        ai_title: ai.title,
        ai_caption: ai.caption,
        ai_trend: ai.trend,
        ai_so_me_type: ai.so_me_type,
        ai_feeling: ai.feeling,
        ai_style: ai.style,

        // New structured remix fields
        ai_subject: ai.subject,
        ai_setting: ai.setting,
        ai_medium: ai.medium,
        ai_realism: ai.realism,
        ai_lighting: ai.lighting,
        ai_palette: ai.palette,
        ai_composition: ai.composition,

        ai_vibe: (ai.vibe || []).join(", "),
        ai_objects: (ai.objects || []).join(", "),
        ai_scenes: (ai.scenes || []).join(" | "),
        ai_people: (ai.people || []).join(", "),
        ai_must_keep: (ai.must_keep || []).join(", "),
      },
    });

    return NextResponse.json({
      url: result.secure_url,
      publicId: result.public_id,
      title,
      ai, // full descriptor for your DB
      tags: mergedTags,
      parentIds: parentIds ?? null,
      community: community ?? null,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}
