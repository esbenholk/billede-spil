import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
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
  const recentImagesResponse = await fetch(
    `/api/cloudinary/recent?&limit=${encodeURIComponent(
      limitNumber
    )}&skip=${encodeURIComponent(skipNumber)}`
  );
  const data = await recentImagesResponse.json();

  console.log("gets data from folder", data);
  for (let index = 0; index < data.length; index++) {
    const element = data[index];

    console.log(element);

    const response = await fetch(
      `${process.env.BASE_URL}/api/cloudinary/upload`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl: element.url,
          title: element.title,
        }),
      }
    );
  }

  return NextResponse.json(data);
}
