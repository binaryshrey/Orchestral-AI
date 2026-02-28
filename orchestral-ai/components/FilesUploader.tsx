"use client";

import React, { useState } from "react";
import { Upload, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadMultipleFilesToGCS } from "@/lib/gcsUpload";

interface UploadedFileInfo {
  gcs_bucket: string;
  gcs_object_path: string;
  public_url: string;
  filename: string;
  size?: number;
  contentType?: string;
}

export default function FilesUploader() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState({
    uploading: false,
    completed: 0,
    total: 0,
    uploadedFiles: [] as UploadedFileInfo[],
  });
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const arr = Array.from(files);
    // Allow PDF, PPTX and legacy PPT files. Use MIME when available, fall back to
    // file extension because some systems/browsers leave `file.type` empty or
    // vary in the reported MIME for PowerPoint files.
    const validFiles = arr.filter((file) => {
      const nameLower = file.name.toLowerCase();
      const isPDF =
        file.type === "application/pdf" || nameLower.endsWith(".pdf");
      const isPPTX =
        file.type ===
          "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        nameLower.endsWith(".pptx");
      const isPPT =
        file.type === "application/vnd.ms-powerpoint" ||
        nameLower.endsWith(".ppt");
      return isPDF || isPPTX || isPPT;
    });

    if (validFiles.length !== arr.length) {
      alert("Only PDF, PPTX or PPT files are allowed");
    }

    // Optional: limit total files
    if (validFiles.length + selectedFiles.length > 20) {
      alert("Maximum 20 files allowed");
      return;
    }

    setSelectedFiles((prev) => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setError(null);
    setUploadProgress({
      uploading: true,
      completed: 0,
      total: selectedFiles.length,
      uploadedFiles: [],
    });

    try {
      const results = await uploadMultipleFilesToGCS(
        selectedFiles,
        "pitch_files",
        (completed, total) => {
          setUploadProgress((prev) => ({ ...prev, completed, total }));
        }
      );

      const successful = results.filter((r: any) => r.success);
      setUploadProgress((prev) => ({
        ...prev,
        uploading: false,
        uploadedFiles: successful.map((s: any) => ({
          gcs_bucket: s.gcs_bucket,
          gcs_object_path: s.gcs_object_path,
          public_url: s.public_url,
          filename: s.filename,
          size: s.size,
          contentType: s.contentType,
        })),
      }));

      // Clear selected files
      setSelectedFiles([]);
    } catch (err: any) {
      console.error("Upload failed", err);
      setError(err?.message || "Upload failed");
      setUploadProgress((prev) => ({ ...prev, uploading: false }));
    }
  };

  return (
    <div>
      <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer">
        {/* full-size invisible input so clicking anywhere in the dashed area opens the file picker */}
        <input
          id="files-input"
          type="file"
          multiple
          accept=".pdf,.pptx,.ppt,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          onChange={handleFileSelect}
        />
        <div className="flex justify-center mb-4 pointer-events-none">
          <Upload className="w-10 h-10 text-gray-400" />
        </div>
        <div className="text-sm text-gray-600 mb-2 pointer-events-none">
          Drop PDF, PPTX or PPT files here or
          <label
            htmlFor="files-input"
            className="text-[#fc7249] font-medium ml-1"
          >
            select files to upload
          </label>
        </div>
        <p className="text-xs text-gray-500 pointer-events-none">
          Up to 20 files (PDF, PPTX, PPT)
        </p>
      </div>

      {/* Selected files list */}
      {selectedFiles.length > 0 && (
        <div className="mt-4 bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">
            Selected files
          </h3>
          <ul className="space-y-2">
            {selectedFiles.map((f, idx) => (
              <li
                key={`${f.name}-${idx}`}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded flex items-center justify-center bg-[#ffd4c4]">
                    <FileText
                      className="w-4 h-4"
                      style={{ color: "#fc7249" }}
                    />
                  </div>
                  <div className="text-sm text-gray-900">{f.name}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-gray-500">
                    {(f.size / 1024).toFixed(1)} KB
                  </div>
                  <button
                    className="text-red-500"
                    onClick={() => removeFile(idx)}
                  >
                    <Trash2 />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setSelectedFiles([])}>
              Clear
            </Button>
            <Button onClick={handleUpload} disabled={uploadProgress.uploading}>
              {uploadProgress.uploading
                ? `Uploading ${uploadProgress.completed}/${uploadProgress.total}`
                : "Upload"}
            </Button>
          </div>
        </div>
      )}

      {/* Uploaded files */}
      {uploadProgress.uploadedFiles.length > 0 && (
        <div className="mt-4 bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">
            Uploaded files
          </h3>
          <ul className="space-y-2">
            {uploadProgress.uploadedFiles.map((f, i) => (
              <li key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded flex items-center justify-center bg-[#ffd4c4]">
                    <FileText
                      className="w-4 h-4"
                      style={{ color: "#fc7249" }}
                    />
                  </div>
                  <a
                    href={f.public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-[#0b61ff]"
                  >
                    {f.filename}
                  </a>
                </div>
                <div className="text-sm text-gray-500">
                  {f.size ? `${(f.size / 1024).toFixed(1)} KB` : "-"}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <div className="mt-3 text-sm text-red-500">{error}</div>}
    </div>
  );
}
