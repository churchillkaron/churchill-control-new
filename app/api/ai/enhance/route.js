import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

async function imageToBuffer(image) {

  // =====================================================
  // BASE64 IMAGE
  // =====================================================

  if (image.startsWith("data:image")) {

    const base64Data = image.split(",")[1];

    return Buffer.from(
      base64Data,
      "base64"
    );
  }

  // =====================================================
  // LOCAL IMAGE
  // =====================================================

  const cleanImage = image.startsWith("/")
    ? image.slice(1)
    : image;

  const localPath = path.join(
    process.cwd(),
    "public",
    cleanImage
  );

  console.log(
    "READ LOCAL IMAGE:",
    localPath
  );

  const buffer =
    fs.readFileSync(localPath);

  return buffer;
}

export async function POST(req) {

  try {

    const body = await req.json();

    const {
      images = [],
      prompt,
      campaignType,
      outputType,
    } = body;

    console.log(
      "TOTAL IMAGES:",
      images.length
    );

    // =====================================================
    // FULL AI MODE
    // =====================================================

    if (!images.length) {

      const response = await fetch(
        "https://api.openai.com/v1/images/generations",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${process.env.OPENAI_API_KEY}`,
          },

          body: JSON.stringify({
            model: "gpt-image-1",
            prompt,
            size: "1536x1024",
            quality: "high",
          }),
        }
      );

      const data =
        await response.json();

      console.log(
        "FULL AI RESPONSE:",
        data
      );

      if (!response.ok) {

        console.error(data);

        return NextResponse.json(
          {
            error:
              data?.error?.message ||
              "Generation failed",

            raw: data,
          },
          {
            status: 500,
          }
        );
      }

      const base64 =
        data?.data?.[0]?.b64_json;

      const imageUrl = base64
        ? `data:image/png;base64,${base64}`
        : null;

      return NextResponse.json({
        url: imageUrl,
        raw: data,
      });
    }

    // =====================================================
    // IMAGE EDIT MODE
    // =====================================================

    const formData = new FormData();

    formData.append(
      "model",
      "gpt-image-1"
    );

    formData.append(
      "prompt",
      prompt
    );

    formData.append(
      "size",
      "1536x1024"
    );

    formData.append(
      "quality",
      "high"
    );

    // =====================================================
    // APPEND ALL IMAGES
    // =====================================================

    let validImageCount = 0;

    for (
      let i = 0;
      i < images.length;
      i++
    ) {

      const image = images[i];

      if (!image) continue;

      try {

        const buffer =
          await imageToBuffer(image);

        if (
          !buffer ||
          !buffer.length
        ) {

          console.log(
            "INVALID BUFFER:",
            image
          );

          continue;
        }

        const blob = new Blob(
          [buffer],
          {
            type: "image/png",
          }
        );

        formData.append(
          "image[]",
          blob,
          `reference-${i}.png`
        );

        validImageCount++;

        console.log(
          `IMAGE ${i} APPENDED`
        );

      } catch (err) {

        console.error(
          `FAILED TO PROCESS IMAGE ${i}:`,
          err
        );
      }
    }

    // =====================================================
    // SAFETY CHECK
    // =====================================================

    if (!validImageCount) {

      return NextResponse.json(
        {
          error:
            "No valid images were uploaded.",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // DEBUG FORM DATA
    // =====================================================

    for (
      const pair of formData.entries()
    ) {

      console.log(
        "FORMDATA:",
        pair[0]
      );
    }

    // =====================================================
    // OPENAI EDIT REQUEST
    // =====================================================

    const response = await fetch(
      "https://api.openai.com/v1/images/edits",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${process.env.OPENAI_API_KEY}`,
        },

        body: formData,
      }
    );

    const data =
      await response.json();

    console.log(
      "EDIT RESPONSE:",
      data
    );

    if (!response.ok) {

      console.error(data);

      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            "Edit failed",

          raw: data,
        },
        {
          status: 500,
        }
      );
    }

    const base64 =
      data?.data?.[0]?.b64_json;

    const imageUrl = base64
      ? `data:image/png;base64,${base64}`
      : null;

    return NextResponse.json({
      url: imageUrl,
      raw: data,
    });

  } catch (err) {

    console.error(
      "AI ENHANCE ERROR:",
      err
    );

    return NextResponse.json(
      {
        error:
          err.message ||
          "Enhance failed",
      },
      {
        status: 500,
      }
    );
  }
}