export async function uploadFileToSupabase(
  file: File,
  folder: string = "uploads"
) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  const res = await fetch("/api/supabase/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(errorData.error || "Failed to upload file");
  }

  const data = await res.json();
  return {
    public_url: data.public_url,
    file_path: data.file_path,
    filename: data.filename,
    size: data.size,
    contentType: data.contentType,
  };
}

export async function uploadMultipleFilesToSupabase(
  files: File[],
  folder: string = "uploads",
  onProgress?: (completed: number, total: number) => void
) {
  const results = [];

  for (let i = 0; i < files.length; i++) {
    try {
      const result = await uploadFileToSupabase(files[i], folder);
      results.push({ success: true, ...result });

      if (onProgress) {
        onProgress(i + 1, files.length);
      }
    } catch (error) {
      console.error(`Failed to upload ${files[i].name}:`, error);
      results.push({
        success: false,
        filename: files[i].name,
        error: error instanceof Error ? error.message : "Upload failed",
      });
    }
  }

  return results;
}
