// app/api/generateImage/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { v2 as cloudinary } from "cloudinary";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ParentDescriptor = {
  title?: string;
  description?: string;
  subject?: string;
  setting?: string;
  medium?: string;
  realism?: string;
  lighting?: string;
  palette?: string;
  composition?: string;
  style?: string;
  vibe?: string[];
  objects?: string[];
  people?: string[];
  trend?: string;
  feeling?: string;
  must_keep?: string[];
};

type RemixParent = {
  url: string;
  descriptor?: ParentDescriptor;
};

const uniq = (arr: string[]) =>
  Array.from(new Set(arr.filter(Boolean).map((s) => String(s).trim())));

function buildAnchors(d: ParentDescriptor | undefined) {
  const objects = Array.isArray(d?.objects) ? d!.objects! : [];
  const vibe = Array.isArray(d?.vibe) ? d!.vibe! : [];
  const people = Array.isArray(d?.people) ? d!.people! : [];
  const mustKeep = Array.isArray(d?.must_keep) ? d!.must_keep! : [];

  return uniq([
    ...mustKeep,
    ...objects.slice(0, 5),
    ...(vibe[0] ? [vibe[0]] : []),
    ...(people[0] ? [people[0]] : []),
  ]).slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      // new
      parents = [],
      adjectives = "",
      communities = [],
      trends = [],
      extraPrompt = "",
      remixStrength = 0.7,

      // legacy compatibility
      descriptions = [],
      styles = [],
      people = [],
      parentIds = [],
      size = "1024x1024",
    }: {
      parents?: RemixParent[];
      adjectives?: string;
      communities?: string[];
      trends?: string[];
      extraPrompt?: string;
      remixStrength?: number;

      descriptions?: string[];
      styles?: string[];
      people?: string[];
      parentIds?: string[];

      size?: "1024x1024" | "1792x1024" | "1024x1792";
    } = body ?? {};

    const strength = Math.max(0, Math.min(1, remixStrength));

    // Support old callers: if parents missing, fabricate from descriptions
    const normalizedParents: RemixParent[] =
      Array.isArray(parents) && parents.length >= 2
        ? parents
        : (descriptions || []).map((d, i) => ({
            url: parentIds?.[i] || "",
            descriptor: { description: d },
          }));

    if (!Array.isArray(normalizedParents) || normalizedParents.length < 2) {
      return NextResponse.json(
        { error: "Provide at least 2 parents." },
        { status: 400 }
      );
    }

    // Build summaries with anchors
    const parentSummaries = normalizedParents.slice(0, 10).map((p, i) => {
      const d = p.descriptor || {};
      return {
        index: i + 1,
        description: d.description || "",
        subject: d.subject || "",
        setting: d.setting || "",
        style: d.style || "",
        medium: d.medium || "",
        realism: d.realism || "",
        lighting: d.lighting || "",
        palette: d.palette || "",
        composition: d.composition || "",
        trend: d.trend || "",
        feeling: d.feeling || "",
        anchors: buildAnchors(d),
      };
    });

    // Ask LLM for a merged plan (looser + remixy)
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

    const mergePrompt = [
      `Create ONE coherent remix image prompt plan inspired by multiple parent descriptions.`,
      `The output should feel like a NEW image inspired by the parents (not a literal collage).`,
      `You may recompose, resize, fuse, and stylize elements for novelty.`,
      `Include ~1–2 recognizable anchors from each parent summary.`,
      `Unify into a single world; no grid/collage.`,
      `Remix intensity remixStrength=${strength} (0 faithful → 1 wild).`,
      `No text, watermark, UI.`,
      "",
      `Context tags:`,
      adjectives ? `- vibe/tags: ${adjectives}` : "",
      communities?.length ? `- community: ${communities.join(", ")}` : "",
      trends?.length ? `- trends: ${trends.join(", ")}` : "",
      extraPrompt ? `- extra: ${extraPrompt}` : "",
      "",
      `Parent summaries:`,
      JSON.stringify(parentSummaries),
    ]
      .filter(Boolean)
      .join("\n");

    const planResp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      max_tokens: 650,
      response_format: { type: "json_schema", json_schema: schema },
      messages: [
        {
          role: "system",
          content:
            "Return only JSON matching the schema. Keep it remixy and visual. Integrate anchors naturally rather than listing them.",
        },
        { role: "user", content: mergePrompt },
      ],
    });

    const plan = JSON.parse(planResp.choices[0]?.message?.content ?? "{}");

    const remixLine =
      strength >= 0.85
        ? "Highly remixed reinterpretation, bold recomposition, surprising fusions."
        : strength >= 0.55
        ? "Creative remix reinterpretation, allow recomposition and scale shifts."
        : "Light remix, subtle rearrangements and stylized integrations.";

    const finalPrompt = [
      `${plan.scene}. ${plan.subject}. ${plan.setting}.`,
      remixLine,
      plan.remix_directive ? plan.remix_directive : "",
      `Composition: ${plan.composition}.`,
      `Medium: ${plan.medium}, realism: ${plan.realism}.`,
      `Lighting: ${plan.lighting}. Palette: ${plan.palette}.`,
      plan.style_notes ? `Style: ${plan.style_notes}.` : "",
      `Must include: ${uniq(plan.must_include || []).join(", ")}.`,
      plan.avoid?.length ? `Avoid: ${uniq(plan.avoid).join(", ")}.` : "",
      `Square image. No text, no watermark, no UI, no logos, no signatures.`,
    ]
      .filter(Boolean)
      .join(" ");

    // ✅ DALL·E 3 generation returns a URL
    const image = await openai.images.generate({
      model: "dall-e-3",
      prompt: finalPrompt,
      n: 1,
      size,
    });

    return NextResponse.json({
      remixedPrompt: finalPrompt,
      plan,
      imageUrl: image.data?.[0]?.url ?? null,
      parentUrls: normalizedParents.map((p) => p.url).filter(Boolean),
    });
  } catch (error) {
    console.error("Generation error (POST):", error);
    return NextResponse.json(
      { error: "Failed to generate content" },
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
