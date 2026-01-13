import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
  process.env;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  throw new Error("Missing Cloudinary environment variables");
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

type Image = {
  id: string;
  url: string;
  title: string;
  tags: string[];
  date: string;
};

export async function GET(request: Request) {
  const skipNumber = 0;
  const limitNumber = 1000;

  const origin = new URL(request.url).origin;

  const recentImagesResponse = await fetch(
    `${origin}/api/cloudinary/recent?limit=${limitNumber}&skip=${skipNumber}`,
    { cache: "no-store" }
  );

  if (!recentImagesResponse.ok) {
    return NextResponse.json(
      { error: "Failed to fetch recent images" },
      { status: 500 }
    );
  }

  const data: Image[] = await recentImagesResponse.json();

  await Promise.all(
    data.map((element) =>
      fetch(`${origin}/api/cloudinary/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: element.url, title: element.title }),
        cache: "no-store",
      })
    )
  );

  return NextResponse.json(data);
}
