// app/api/generateImage/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { v2 as cloudinary } from "cloudinary";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface GenerationResult {
  sentence: string;
  imageUrl: string;
  trends: string[];
  geo: string;
}

/** Helper: safe join */
const join = (arr?: string[] | null, sep = ", ") =>
  Array.isArray(arr)
    ? arr
        .filter(Boolean)
        .map((s) => s.trim())
        .join(sep)
    : "";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

type ParentDescriptor = {
  // Minimal
  title?: string;
  description?: string;

  // New structured fields (recommended)
  subject?: string;
  setting?: string;
  medium?: string; // "3D render" | "photograph" | "illustration" etc.
  realism?: string; // "photorealistic" | "stylized" etc.
  lighting?: string;
  palette?: string;
  composition?: string;

  // Existing fields you already have
  style?: string;
  vibe?: string[];
  objects?: string[];
  people?: string[];
  trend?: string;
  feeling?: string;

  // Anchors
  must_keep?: string[]; // 3–8 items that should survive the remix
};

type RemixParent = {
  url: string; // Cloudinary URL or any public URL
  descriptor?: ParentDescriptor;
};

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

function buildAnchors(d: ParentDescriptor | undefined) {
  const objects = Array.isArray(d?.objects) ? d!.objects! : [];
  const vibe = Array.isArray(d?.vibe) ? d!.vibe! : [];
  const people = Array.isArray(d?.people) ? d!.people! : [];
  const mustKeep = Array.isArray(d?.must_keep) ? d!.must_keep! : [];

  // Anchors: explicit must_keep first, then top objects + 1 vibe + 1 person cue
  const anchors = uniq([
    ...mustKeep,
    ...objects.slice(0, 5),
    ...(vibe[0] ? [vibe[0]] : []),
    ...(people[0] ? [people[0]] : []),
  ]).slice(0, 10);

  return anchors;
}

async function urlToFile(url: string, fallbackName: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url} (${res.status})`);

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
    ? "webp"
    : "jpg";

  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);

  // Node 18+ has File/Blob
  return new File([buf], `${fallbackName}.${ext}`, { type: contentType });
}

export async function uploadB64ToCloudinary(b64: string) {
  if (!b64 || typeof b64 !== "string") {
    throw new Error("Missing base64 image");
  }

  const buffer = Buffer.from(b64, "base64");

  return await new Promise<string>((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder: "imageEcology/placeholders",
        resource_type: "image",
        format: "png",
        transformation: [{ quality: "auto" }, { fetch_format: "auto" }],
      },
      (err, result) => {
        if (err) {
          console.error("Cloudinary error:", err);
          return reject(err);
        }

        if (!result?.secure_url) {
          console.error("Cloudinary returned no URL:", result);
          return reject(new Error("Cloudinary returned no secure_url"));
        }

        resolve(result.secure_url);
      }
    );

    upload.end(buffer);
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    console.log("POST REQ: body", body);

    const {
      parents = [],
      adjectives = "",
      communities = [],
      trends = [],
      extraPrompt = "",
      size = "1024x1024",

      // ✅ new “looseness” knobs (optional from frontend)
      remixStrength = 0.65, // 0 (rigid) → 1 (very remixy)
      anchorPerParent = "1-2", // "1-2" or "2" etc.
    }: {
      parents: RemixParent[];
      adjectives?: string;
      communities?: string[];
      trends?: string[];
      extraPrompt?: string;
      size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
      remixStrength?: number;
      anchorPerParent?: "1-2" | "2" | "2-3";
    } = body ?? {};

    if (!Array.isArray(parents) || parents.length < 2) {
      return NextResponse.json(
        { error: "Provide at least 2 parents." },
        { status: 400 }
      );
    }

    const strength = Math.max(0, Math.min(1, remixStrength));

    // 1) Download parent images -> Files
    const imageFiles: File[] = await Promise.all(
      parents.slice(0, 16).map((p, i) => urlToFile(p.url, `parent-${i + 1}`))
    );

    // 2) Build per-parent anchor summaries (high signal)
    const parentSummaries = parents.slice(0, 16).map((p, i) => {
      const d = p.descriptor || {};
      const anchors = buildAnchors(d);

      return {
        index: i + 1,
        url: p.url,
        subject: d.subject || "",
        setting: d.setting || "",
        medium: d.medium || "",
        realism: d.realism || "",
        lighting: d.lighting || "",
        palette: d.palette || "",
        composition: d.composition || "",
        vibe: Array.isArray(d.vibe) ? d.vibe : [],
        people: Array.isArray(d.people) ? d.people : [],
        objects: Array.isArray(d.objects) ? d.objects : [],
        trend: d.trend || "",
        feeling: d.feeling || "",
        style: d.style || "",
        anchors,
      };
    });

    console.log("SUMMARIZES PARENTS", parentSummaries);

    // 3) Ask LLM for a *merged plan* (Structured Outputs), then render a final prompt
    const schema = {
      name: "RemixPlan",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          scene: { type: "string" },
          subject: { type: "string" },
          setting: { type: "string" },
          composition: { type: "string" },
          medium: { type: "string" },
          realism: { type: "string" },
          lighting: { type: "string" },
          palette: { type: "string" },
          style_notes: { type: "string" },
          must_include: {
            type: "array",
            items: { type: "string" },
            minItems: 4,
            maxItems: 16,
          },
          avoid: {
            type: "array",
            items: { type: "string" },
            minItems: 0,
            maxItems: 14,
          },
          // ✅ new: give the model explicit “remix permission” in output too
          remix_directive: { type: "string" },
        },
        required: [
          "scene",
          "subject",
          "setting",
          "composition",
          "medium",
          "realism",
          "lighting",
          "palette",
          "style_notes",
          "must_include",
          "avoid",
          "remix_directive",
        ],
      },
    } as const;

    // ✅ NEW: creative remix rules + less rigid anchors + composition freedom
    // We still ensure recognizability via must_include, but allow re-layout/fusion.
    const mergePrompt = [
      `Create ONE coherent remix plan from multiple parent images.`,
      ``,
      `Remix intent (critical):`,
      `- The output should feel like a NEW image inspired by the parents, not a faithful copy.`,
      `- You are allowed to reinterpret, resize, relocate, fuse, or stylize elements from all parents.`,
      `- Preserve recognizability, but not exact layout, camera angle, or proportions.`,
      `- You MAY change composition, perspective, framing, scale, and staging for higher impact.`,
      `- Prefer surprising, meme-forward recombinations while keeping it visually coherent.`,
      ``,
      `Anchor rules:`,
      `- Include at least ${anchorPerParent} recognizable anchor items from EACH parent (use parentSummaries[*].anchors).`,
      `- Anchors can appear as props, background motifs, wardrobe details, environment cues, or fused elements.`,
      `- Do NOT just “list” anchors; integrate them naturally into the scene.`,
      ``,
      `Style rules:`,
      `- Choose ONE dominant medium + realism; harmonize lighting/palette.`,
      `- If parents conflict, blend them into a single aesthetic (do not enumerate styles).`,
      ``,
      `Output constraints:`,
      `- Unify into a single world (no grid/collage).`,
      `- Keep it social-media-friendly and visually striking.`,
      `- No text, no watermark, no UI.`,
      ``,
      `Creative looseness:`,
      `- remixStrength=${strength} where 0=faithful edit and 1=highly remixed.`,
      `- At higher remixStrength, push more transformation and unexpected composition shifts.`,
      ``,
      `Context tags:`,
      adjectives ? `- vibe/tags: ${adjectives}` : "",
      communities?.length ? `- community: ${communities.join(", ")}` : "",
      trends?.length ? `- trends: ${trends.join(", ")}` : "",
      extraPrompt ? `- extra: ${extraPrompt}` : "",
      "",
      `Parent summaries (anchors + style fields):`,
      JSON.stringify(parentSummaries),
    ]
      .filter(Boolean)
      .join("\n");

    const planResp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.55, // ✅ slightly higher to encourage more novel recombination
      max_tokens: 650,
      response_format: { type: "json_schema", json_schema: schema },
      messages: [
        {
          role: "system",
          content:
            "Return only JSON matching the schema. Prefer concrete visual anchors. Keep the plan remixy, not literal. Use remixStrength to decide how bold to be.",
        },
        { role: "user", content: mergePrompt },
      ],
    });

    const planRaw = planResp.choices[0]?.message?.content ?? "{}";
    const plan = JSON.parse(planRaw) as {
      scene: string;
      subject: string;
      setting: string;
      composition: string;
      medium: string;
      realism: string;
      lighting: string;
      palette: string;
      style_notes: string;
      must_include: string[];
      avoid: string[];
      remix_directive: string;
    };

    // ✅ NEW: bake in “remix permission” directly into the final prompt
    // Also: scale the language based on remixStrength.
    const remixLine =
      strength >= 0.8
        ? "Highly remixed reinterpretation with bold recomposition and surprising fusions."
        : strength >= 0.5
        ? "Creative remix reinterpretation; allow recomposition, scale shifts, and fused elements."
        : "Light remix; small but noticeable rearrangements and stylized integrations.";

    const finalPrompt = [
      // Core
      `${plan.scene}. ${plan.subject}. ${plan.setting}.`,
      // Remix directive (important for the image model)
      remixLine,
      plan.remix_directive ? plan.remix_directive : "",
      // Visual control (but not too rigid)
      `Composition: ${plan.composition}.`,
      `Medium: ${plan.medium}, realism: ${plan.realism}.`,
      `Lighting: ${plan.lighting}. Palette: ${plan.palette}.`,
      plan.style_notes ? `Style: ${plan.style_notes}.` : "",
      // Anchors
      `Must include (integrated naturally): ${uniq(plan.must_include).join(
        ", "
      )}.`,
      plan.avoid?.length ? `Avoid: ${uniq(plan.avoid).join(", ")}.` : "",
      // Universal constraints
      `No text, no watermark, no UI, no logos, no signatures.`,
      `Square image.`,
    ]
      .filter(Boolean)
      .join(" ");

    console.log("has final prompt", finalPrompt);

    // 4) Image remix using multi-image edits (array syntax)
    const form = new FormData();
    form.append("model", "gpt-image-1.5");
    form.append("prompt", finalPrompt);
    form.append("size", size || "1024x1024");
    form.append("output_format", "png");

    // ✅ keep multi-image, but allow a softer influence by ordering:
    // Put the "base" first; others follow. (Many models implicitly bias earlier inputs.)
    for (let i = 0; i < imageFiles.length; i++) {
      form.append("image[]", imageFiles[i]);
    }

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: form,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI image edit failed: ${err}`);
    }

    const img = await res.json();

    console.log("has image", img);

    const b64 = img.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json(
        { error: "No image returned." },
        { status: 500 }
      );
    }

    // 5) Upload remix output to Cloudinary
    const remixUrl = await uploadB64ToCloudinary(b64);

    console.log("uploaded to cloudinary temp folder", remixUrl);

    return NextResponse.json({
      remixedPrompt: finalPrompt,
      plan,
      remixStrength: strength,
      imageUrl: remixUrl,
      parentUrls: parents.map((p) => p.url),
    });
  } catch (err: any) {
    console.error("Remix error:", err);
    return NextResponse.json(
      { error: "Failed to remix images" },
      { status: 500 }
    );
  }
}

/** ---------- Existing GET (kept for compatibility) ---------- */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const prompt = url.searchParams.get("prompt") || "";
    const adjectives = url.searchParams.get("adjectives") || "";

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content:
            `pretend that you are an image prompt engineer that is trying to produce social media content.` +
            `We need to write an image prompt that expands on and depicts the following sentence: There is... ${prompt}. ` +
            `The image should fit this vibe: ${adjectives} and be in the style of mediaval drawings or post-internet graphics and sci-fi, ` +
            `please output an image prompt in english`,
        },
      ],
      max_tokens: 100,
    });

    const sentence = (completion.choices[0].message.content || "").replace(
      '"',
      ""
    );

    const styleSuffix =
      "the image should be in the style of mideaval drawings, fantasy, post-internet graphics and sci-fi. the image is not allowed to show any caption or UI element.";

    const image = await openai.images.generate({
      model: "dall-e-3",
      prompt: `${sentence}\n${styleSuffix}`.trim(),
      n: 1,
      size: "1024x1024",
    });

    const data = {
      prompt,
      remixedPrompt: sentence,
      imageUrl: image.data ? image.data[0].url : "imageurlplaceholder",
      tags: adjectives,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("Generation error (GET):", error);
    return NextResponse.json(
      { error: "Failed to generate content" },
      { status: 500 }
    );
  }
}
