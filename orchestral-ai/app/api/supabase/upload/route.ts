import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "project_files";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const folder = (formData.get("folder") as string) || "uploads";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const safeName = file.name.replace(/\\/g, "/").split("/").pop()!;
    const filePath = `${folder}/${Date.now()}-${safeName}`;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (error) {
      console.error("Supabase storage upload error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      public_url: urlData.publicUrl,
      file_path: filePath,
      filename: file.name,
      size: file.size,
      contentType: file.type,
    });
  } catch (err: any) {
    console.error("Error uploading to Supabase Storage:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to upload file" },
      { status: 500 }
    );
  }
}
