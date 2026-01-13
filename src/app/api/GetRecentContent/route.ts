import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const skipNumber = parseInt(url.searchParams.get("skip") as string) || 0;
    const limitNumber =
      parseInt(url.searchParams.get("limit") as string) || 10000;

    const recentImagesResponse = await fetch(
      `/api/cloudinary/recent?limit=${encodeURIComponent(
        limitNumber
      )}&skip=${encodeURIComponent(skipNumber)}`
    );
    const data = await recentImagesResponse.json();

    console.log("CALLS 100 IMAGES", recentImagesResponse);

    if (!recentImagesResponse.ok)
      throw new Error(data.error || "Generation failed");

    return NextResponse.json(data);
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate content" },
      { status: 500 }
    );
  }
}
