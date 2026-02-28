/**
 * Upload a file to Google Cloud Storage
 * Uses direct server upload for local dev (when signed URLs fail)
 * Uses signed URLs for production (Vercel with Workload Identity)
 *
 * @param file - The file to upload
 * @param folder - The folder path in GCS (default: "uploads")
 * @returns Promise with GCS bucket and object path information
 */
export async function uploadFileToGCS(file: File, folder: string = "uploads") {
  // Try server-side upload first (works for local dev)
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    const res = await fetch("/api/gcs/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errorData = await res
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(errorData.error || "Failed to upload file");
    }

    const data = await res.json();
    return {
      gcs_bucket: data.gcs_bucket,
      gcs_object_path: data.gcs_object_path,
      public_url: data.public_url,
      filename: data.filename,
      size: data.size,
      contentType: data.contentType,
    };
  } catch (error) {
    console.error("Upload error:", error);
    throw error;
  }
}

/**
 * Upload multiple files to GCS
 *
 * @param files - Array of files to upload
 * @param folder - The folder path in GCS
 * @param onProgress - Optional callback for progress updates
 * @returns Promise with array of upload results
 */
export async function uploadMultipleFilesToGCS(
  files: File[],
  folder: string = "uploads",
  onProgress?: (completed: number, total: number) => void
) {
  const results = [];

  for (let i = 0; i < files.length; i++) {
    try {
      const result = await uploadFileToGCS(files[i], folder);
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
