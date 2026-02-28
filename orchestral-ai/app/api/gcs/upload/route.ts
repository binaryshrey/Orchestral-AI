import { NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";

// This route handles direct server-side uploads for local development
// In production, use the signed-upload route for direct browser uploads
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const folder = (formData.get("folder") as string) || "uploads";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Initialize Storage client
    const storageOptions: any = {
      projectId: process.env.GCP_PROJECT_ID,
    };

    // For local dev: use the credentials file if specified
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      storageOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    } else if (process.env.GCP_CREDENTIALS_BASE64) {
      // For production (Vercel): use credentials from environment variable
      // Supports both service_account and authorized_user types
      // The credentials should be base64-encoded JSON
      try {
        const decodedKey = Buffer.from(
          process.env.GCP_CREDENTIALS_BASE64,
          "base64"
        ).toString("utf-8");
        storageOptions.credentials = JSON.parse(decodedKey);
      } catch (parseError) {
        console.error("Failed to parse GCP_CREDENTIALS_BASE64:", parseError);
        throw new Error("Invalid GCP credentials");
      }
    }

    const storage = new Storage(storageOptions);

    const bucketName = process.env.GCS_BUCKET_NAME!;
    const safeName = file.name.replace(/\\/g, "/").split("/").pop()!;
    const objectPath = `${folder}/${Date.now()}-${safeName}`;

    const bucket = storage.bucket(bucketName);
    const blob = bucket.file(objectPath);

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload directly to GCS
    await blob.save(buffer, {
      metadata: {
        contentType: file.type || "application/octet-stream",
      },
    });

    // Generate public URL
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${objectPath}`;

    return NextResponse.json({
      success: true,
      gcs_bucket: bucketName,
      gcs_object_path: objectPath,
      public_url: publicUrl,
      filename: file.name,
      size: file.size,
      contentType: file.type,
    });
  } catch (err: any) {
    console.error("Error uploading to GCS:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to upload file" },
      { status: 500 }
    );
  }
}
