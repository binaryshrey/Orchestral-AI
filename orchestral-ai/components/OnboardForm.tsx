"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Check,
  X,
  Camera,
  Mic,
  Upload,
  FileText,
  Trash2,
  AlertCircle,
  Link2,
  Pencil,
} from "lucide-react";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { uploadMultipleFilesToSupabase } from "@/lib/supabaseUpload";
import { toast } from "sonner";

interface User {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface OnboardFormProps {
  user: User;
}

type MCPApp = {
  id: string;
  name: string;
  description: string;
  mcpServer: string;
  requiredScopes: string[];
  defaultServerUrl: string;
};

type MCPConnectionDraft = {
  serverUrl: string;
  workspaceId: string;
  accessToken: string;
  notes: string;
};

type MCPConnection = MCPConnectionDraft & {
  connectedAt: string;
};

type UploadedFile = {
  public_url: string;
  file_path: string;
  filename: string;
  size: number;
  contentType: string;
};

type UploadSuccess = UploadedFile & { success: true };
type UploadFailure = { success: false; filename: string; error: string };
type UploadResult = UploadSuccess | UploadFailure;

const MCP_APPS: MCPApp[] = [
  {
    id: "github",
    name: "GitHub",
    description: "Repos, issues, pull requests, and code search.",
    mcpServer: "github-mcp",
    requiredScopes: ["repo", "read:org"],
    defaultServerUrl: "https://api.github.com",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Channels, messages, threads, and notifications.",
    mcpServer: "slack-mcp",
    requiredScopes: ["channels:read", "chat:write", "users:read"],
    defaultServerUrl: "https://mcp.slack.local",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Pages, databases, and docs for knowledge workflows.",
    mcpServer: "notion-mcp",
    requiredScopes: ["read:content", "write:content"],
    defaultServerUrl: "https://mcp.notion.local",
  },
  {
    id: "streamlit",
    name: "Streamlit",
    description: "Manage GitHub-backed Streamlit apps",
    mcpServer: "streamlit-mcp",
    requiredScopes: ["repo", "read:org"],
    defaultServerUrl: "https://api.github.com",
  },
];

export default function OnboardForm({ user }: OnboardFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"form" | "permissions">("form");
  const [duration, setDuration] = useState("60"); // Duration in seconds
  const [error, setError] = useState<string | null>(null);
  const [activeMcpApp, setActiveMcpApp] = useState<MCPApp | null>(null);
  const [mcpConnections, setMcpConnections] = useState<
    Record<string, MCPConnection>
  >({});
  const [mcpDraft, setMcpDraft] = useState<MCPConnectionDraft>({
    serverUrl: "",
    workspaceId: "",
    accessToken: "",
    notes: "",
  });

  // Form state
  const [formData, setFormData] = useState({
    startupName: "",
    content: "",
    language: "en",
  });

  // File upload states
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{
    uploading: boolean;
    completed: number;
    total: number;
    uploadedFiles: Array<{
      public_url: string;
      file_path: string;
      filename: string;
    }>;
  }>({
    uploading: false,
    completed: 0,
    total: 0,
    uploadedFiles: [],
  });

  // Permission states
  const [micPermission, setMicPermission] = useState<
    "pending" | "granted" | "denied"
  >("pending");
  const [cameraPermission, setCameraPermission] = useState<
    "pending" | "granted" | "denied"
  >("pending");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const cleanupStreams = useCallback(() => {
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, [cameraStream, micStream]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      cleanupStreams();
    };
  }, [cleanupStreams]);

  useEffect(() => {
    // Connect camera stream to video element when it becomes available
    if (cameraStream && videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = cameraStream;
      videoPreviewRef.current.play().catch((err) => {
        console.error("Error playing video:", err);
      });
    }
  }, [cameraStream]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const fileArray = Array.from(files);

    // Accept files based on either a known MIME type OR a matching file extension.
    // Some platforms/browsers may leave `file.type` empty or use different MIME
    // values for PowerPoint files, so checking the filename extension is more
    // reliable in practice.
    const validFiles = fileArray.filter((file) => {
      const name = file.name.toLowerCase();
      const isPDF = file.type === "application/pdf" || name.endsWith(".pdf");
      const isPPTX =
        file.type ===
          "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        name.endsWith(".pptx");
      const isPPT =
        file.type === "application/vnd.ms-powerpoint" || name.endsWith(".ppt");
      return isPDF || isPPTX || isPPT;
    });

    if (validFiles.length !== fileArray.length) {
      alert(
        "Only PDF, PPTX or PPT files are allowed. Unsupported files were ignored.",
      );
    }

    setSelectedFiles((prev) => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (): Promise<UploadSuccess[]> => {
    if (selectedFiles.length === 0) return [];

    setUploadProgress({
      uploading: true,
      completed: 0,
      total: selectedFiles.length,
      uploadedFiles: [],
    });

    try {
      const results = (await uploadMultipleFilesToSupabase(
        selectedFiles,
        "project_sessions",
        (completed, total) => {
          setUploadProgress((prev) => ({
            ...prev,
            completed,
            total,
          }));
        },
      )) as UploadResult[];

      const successfulUploads = results.filter(
        (result): result is UploadSuccess => result.success,
      );

      setUploadProgress((prev) => ({
        ...prev,
        uploading: false,
        uploadedFiles: successfulUploads.map((r) => ({
          public_url: r.public_url,
          file_path: r.file_path,
          filename: r.filename,
        })),
      }));

      // Log uploaded files info
      console.log("✅ Files uploaded to Supabase Storage:");
      successfulUploads.forEach((file, index: number) => {
        console.log(`\n📄 File ${index + 1}:`, {
          filename: file.filename,
          size: `${(file.size / 1024).toFixed(2)} KB`,
          contentType: file.contentType,
          file_path: file.file_path,
          public_url: file.public_url,
        });
      });

      // Clear selected files after successful upload
      setSelectedFiles([]);

      return successfulUploads;
    } catch (error) {
      console.error("Upload error:", error);
      setUploadProgress((prev) => ({
        ...prev,
        uploading: false,
      }));
      throw error;
    }
  };

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(stream);
      setMicPermission("granted");

      // Setup audio level monitoring
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);
      analyser.fftSize = 256;

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateAudioLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(average);
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        }
      };

      updateAudioLevel();
    } catch (err) {
      console.error("Microphone permission denied:", err);
      setMicPermission("denied");
    }
  };

  const requestCameraPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraStream(stream);
      setCameraPermission("granted");

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        // Explicitly play the video to ensure it starts
        try {
          await videoPreviewRef.current.play();
        } catch (playError) {
          console.error("Error playing video:", playError);
        }
      }
    } catch (err) {
      console.error("Camera permission denied:", err);
      setCameraPermission("denied");
    }
  };

  const handleContinueToPermissions = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Validate required fields only — upload & DB save happen on "Start Pitch Simulation"
      if (!formData.startupName.trim()) {
        throw new Error("Startup name is required");
      }

      if (!formData.content.trim()) {
        throw new Error("Description is required");
      }

      // Move to permissions step
      setStep("permissions");

      // Auto-request permissions when step changes
      setTimeout(() => {
        requestMicrophonePermission();
        requestCameraPermission();
      }, 500);
    } catch (error) {
      console.error("Error during validation:", error);
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      setError(errorMessage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartPitch = async () => {
    setIsLoading(true);
    setError(null);

    try {
      let uploadedFiles: UploadSuccess[] = [];

      // Step 1: Upload files to GCS if any are selected
      if (selectedFiles.length > 0) {
        const uploadToastId = toast.loading(
          "Uploading pitch files to cloud...",
        );
        try {
          uploadedFiles = await uploadFiles();
          if (!uploadedFiles || uploadedFiles.length === 0) {
            toast.error("File upload failed. Please try again.", {
              id: uploadToastId,
            });
            setIsLoading(false);
            return;
          }
          toast.success(
            `${uploadedFiles.length} file(s) uploaded successfully!`,
            { id: uploadToastId },
          );
        } catch {
          toast.error("File upload failed. Please try again.", {
            id: uploadToastId,
          });
          setIsLoading(false);
          return;
        }
      }

      // Step 2: Save project session to Supabase
      const userName =
        user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`.trim()
          : user.email.split("@")[0];

      const sessionData = {
        user_id: user.id,
        user_name: userName,
        user_email: user.email,
        project_name: formData.startupName,
        description: formData.content || "",
        duration_seconds: parseInt(duration),
        language: formData.language,
        file_url: uploadedFiles.length > 0 ? uploadedFiles[0].public_url : "",
        file_path: uploadedFiles.length > 0 ? uploadedFiles[0].file_path : "",
        file_name: uploadedFiles.length > 0 ? uploadedFiles[0].filename : "",
        feedback: {},
        score: {},
        status: "Pending",
      };

      const dbToastId = toast.loading("Saving your project session...");

      const response = await fetch("/api/supabase/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        toast.error("Failed to save session. Please try again.", {
          id: dbToastId,
        });
        throw new Error(
          errorData.error || `Failed to save data: ${response.statusText}`,
        );
      }

      const savedSession = await response.json();
      toast.success("Session saved! Launching simulation...", {
        id: dbToastId,
      });

      // Persist session id for feedback components
      try {
        if (savedSession?.id) {
          sessionStorage.setItem("project_session_id", String(savedSession.id));
        }
      } catch (err) {
        console.warn(
          "Failed to save project_session_id to sessionStorage:",
          err,
        );
      }

      // Persist project context so the agents-workflow page can generate a Gemini plan
      try {
        sessionStorage.setItem(
          "agent_plan_context",
          JSON.stringify({
            project_name: formData.startupName,
            description: formData.content || "",
            pdf_url:
              uploadedFiles.length > 0 ? uploadedFiles[0].public_url : "",
            session_id: savedSession?.id ? String(savedSession.id) : "",
          }),
        );
      } catch (err) {
        console.warn(
          "Failed to save agent_plan_context to sessionStorage:",
          err,
        );
      }

      // Step 3: Navigate after brief delay so user sees the success toast
      setTimeout(() => {
        router.push(
          `/dashboard/agents-workflow?autoStart=true&duration=${duration}&id=${savedSession.id}`,
        );
      }, 1500);
    } catch (error) {
      console.error("Error during pitch start:", error);
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const allPermissionsGranted =
    micPermission === "granted" && cameraPermission === "granted";

  const openMcpModal = (app: MCPApp) => {
    const existing = mcpConnections[app.id];
    setActiveMcpApp(app);
    setMcpDraft({
      serverUrl: existing?.serverUrl ?? app.defaultServerUrl,
      workspaceId: existing?.workspaceId ?? "",
      accessToken: existing?.accessToken ?? "",
      notes: existing?.notes ?? "",
    });
  };

  const closeMcpModal = () => {
    setActiveMcpApp(null);
  };

  const saveMcpConnection = () => {
    if (!activeMcpApp) return;
    setMcpConnections((prev) => ({
      ...prev,
      [activeMcpApp.id]: {
        ...mcpDraft,
        connectedAt: new Date().toISOString(),
      },
    }));
    closeMcpModal();
  };

  if (step === "permissions") {
    return (
      <div className="mt-8 space-y-6">
        {/* Permission Setup Card */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-6 sm:p-8 shadow-sm">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Setup Your Devices
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              We need access to your microphone and camera for the pitch
              simulation
            </p>
          </div>

          <div className="space-y-6">
            {/* Microphone Check */}
            <div className="border border-gray-200 dark:border-zinc-700 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      micPermission === "granted"
                        ? "bg-green-100 dark:bg-green-900/30"
                        : micPermission === "denied"
                          ? "bg-red-100 dark:bg-red-900/30"
                          : "bg-gray-100 dark:bg-zinc-800"
                    }`}
                  >
                    <Mic
                      className={`w-6 h-6 ${
                        micPermission === "granted"
                          ? "text-green-600 dark:text-green-400"
                          : micPermission === "denied"
                            ? "text-red-600 dark:text-red-400"
                            : "text-gray-600 dark:text-gray-400"
                      }`}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      Microphone
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {micPermission === "granted" && "Working perfectly!"}
                      {micPermission === "denied" && "Permission denied"}
                      {micPermission === "pending" && "Requesting access..."}
                    </p>
                  </div>
                </div>
                {micPermission === "granted" && (
                  <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
                )}
                {micPermission === "denied" && (
                  <X className="w-6 h-6 text-red-600 dark:text-red-400" />
                )}
              </div>

              {micPermission === "granted" && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Audio Level
                  </p>
                  <div className="w-full h-2 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all duration-100"
                      style={{
                        width: `${Math.min((audioLevel / 128) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Speak to test your microphone
                  </p>
                </div>
              )}

              {micPermission === "denied" && (
                <Button
                  onClick={requestMicrophonePermission}
                  variant="outline"
                  size="sm"
                  className="mt-4 py-3 sm:py-2"
                >
                  Try Again
                </Button>
              )}
            </div>

            {/* Camera Check */}
            <div className="border border-gray-200 dark:border-zinc-700 rounded-lg p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      cameraPermission === "granted"
                        ? "bg-green-100 dark:bg-green-900/30"
                        : cameraPermission === "denied"
                          ? "bg-red-100 dark:bg-red-900/30"
                          : "bg-gray-100 dark:bg-zinc-800"
                    }`}
                  >
                    <Camera
                      className={`w-6 h-6 ${
                        cameraPermission === "granted"
                          ? "text-green-600 dark:text-green-400"
                          : cameraPermission === "denied"
                            ? "text-red-600 dark:text-red-400"
                            : "text-gray-600 dark:text-gray-400"
                      }`}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      Camera
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {cameraPermission === "granted" && "Working perfectly!"}
                      {cameraPermission === "denied" && "Permission denied"}
                      {cameraPermission === "pending" && "Requesting access..."}
                    </p>
                  </div>
                </div>
                {cameraPermission === "granted" && (
                  <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
                )}
                {cameraPermission === "denied" && (
                  <X className="w-6 h-6 text-red-600 dark:text-red-400" />
                )}
              </div>

              {cameraPermission === "granted" && (
                <div className="mt-4">
                  <video
                    ref={videoPreviewRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full aspect-video bg-gray-900 rounded-lg max-h-48 object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Camera preview
                  </p>
                </div>
              )}

              {cameraPermission === "denied" && (
                <Button
                  onClick={requestCameraPermission}
                  variant="outline"
                  size="sm"
                  className="mt-4 py-3 sm:py-2"
                >
                  Try Again
                </Button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <Button
              onClick={() => {
                cleanupStreams();
                setStep("form");
                setMicPermission("pending");
                setCameraPermission("pending");
              }}
              variant="outline"
              size="lg"
              className="flex-1 cursor-pointer py-2 sm:py-3"
            >
              Back
            </Button>
            <Button
              onClick={handleStartPitch}
              disabled={!allPermissionsGranted || isLoading}
              size="lg"
              className="flex-1 bg-[#fc7249] hover:bg-[#fc7249]/90 text-white font-semibold cursor-pointer py-2 sm:py-3"
            >
              {isLoading && <Loader2 className="h-5 w-5 animate-spin mr-2" />}
              {isLoading ? "Launching..." : "Start Pitch Simulation"}
            </Button>
          </div>

          {!allPermissionsGranted && (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
              Please grant both microphone and camera permissions to continue
            </p>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-8 space-y-1">
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* First Input Group - Configuration with Selects */}
      <div className="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Configuration
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Configure your pitch setup
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Duration
              </label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="w-full sm:w-44 cursor-pointer">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 seconds</SelectItem>
                  <SelectItem value="60">1 minute</SelectItem>
                  <SelectItem value="120">2 minutes</SelectItem>
                  <SelectItem value="180">3 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Language
              </label>
              <Select
                value={formData.language}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, language: value }))
                }
              >
                <SelectTrigger className="w-full sm:w-44 cursor-pointer">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">🇺🇸 English</SelectItem>
                  <SelectItem value="fr">🇫🇷 French</SelectItem>
                  <SelectItem value="zh">🇯🇵 Japanese</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Project + MCP Block */}
      <div className="bg-white dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-6 shadow-sm">
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                title="Fill default project values"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    startupName: "Paper2Prod",
                    content: `Project Objective\n\nBuild an autonomous multi-agent system that transforms an academic research paper (PDF) into a fully functional Streamlit application deployed on Replit, with structured documentation and reproducible mathematical implementations.\n\nHigh-Level Goal\n\nGiven a research paper as input, the system must:\n\n- Understand the paper's core problem, methodology, algorithms, and formulas.\n- Extract and interpret mathematical equations.\n- Translate theoretical methods into executable Python logic.\n- Generate a modular Streamlit application implementing the research.\n- Create a well-structured GitHub repository including architecture.md, README.md, requirements.txt, and modular Python files.\n- Deploy the app to Replit.\n- Validate correctness of formulas and outputs.\n\nFunctional Requirements\n\n1. Research Understanding Layer\n   - Parse PDF research paper.\n   - Extract: problem statement, assumptions, methodology, algorithms, mathematical formulas, experimental setup.\n   - Summarize implementation requirements.\n\n2. Mathematical Extraction & Interpretation Layer\n   - Identify equations from LaTeX or PDF format.\n   - Convert formulas into symbolic representations.\n   - Validate variable definitions and relationships.\n   - Translate equations into Python-compatible functions.\n\n3. Architecture Design Layer\n   - Design application architecture.\n   - Create architecture.md, component breakdown, data flow diagrams.\n   - Define module structure: core/, utils/, models/, ui/.\n\n4. Code Generation Layer\n   - Implement mathematical functions, core logic, data preprocessing, Streamlit UI components.\n   - Ensure modular and readable Python code.\n   - Add docstrings and comments explaining theory-to-code mapping.\n\n5. Validation & Testing Layer\n   - Generate unit tests for formula correctness.\n   - Compare outputs against sample values (if available).\n   - Detect inconsistencies between paper and implementation.\n\n6. Deployment Layer\n   - Initialize GitHub repository.\n   - Push structured project files.\n   - Configure Replit environment.\n   - Deploy Streamlit app.\n   - Provide public deployment link.`,
                  }))
                }
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-zinc-800 transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Project Context & MCP Apps
              </h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Add project details and connect external apps through MCP.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="startupName"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Project Name <span className="text-red-500">*</span>
            </label>
            <Input
              id="startupName"
              type="text"
              placeholder="Enter your project name"
              className="w-full"
              value={formData.startupName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  startupName: e.target.value,
                }))
              }
              required
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="content"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Description <span className="text-red-500">*</span>
            </label>
            <Textarea
              id="content"
              placeholder="Describe your product or vision..."
              rows={2}
              className="w-full resize-none min-h-20"
              value={formData.content}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, content: e.target.value }))
              }
              required
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="attachments"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Attachments (Optional)
            </label>
            <div className="relative">
              <input
                id="attachments"
                type="file"
                accept=".pdf,.pptx,.ppt,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
                multiple
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={uploadProgress.uploading}
              />
              <div className="w-full h-24 sm:h-32 border-2 border-dashed border-gray-200 dark:border-zinc-700 rounded-lg flex flex-col items-center justify-center gap-2 bg-gray-50 dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors">
                {uploadProgress.uploading ? (
                  <>
                    <Loader2 className="w-8 h-8 text-[#fc7249] animate-spin" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Uploading {uploadProgress.completed} of{" "}
                        {uploadProgress.total}...
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        PDF or PPTX files
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Display selected files */}
            {selectedFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Selected Files ({selectedFiles.length})
                </p>
                <div className="space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                          {file.name}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        onClick={() => removeFile(index)}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 ml-2"
                        type="button"
                        disabled={uploadProgress.uploading}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Display uploaded files */}
            {uploadProgress.uploadedFiles.length > 0 && (
              <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <p className="text-xs font-medium text-green-700 dark:text-green-400">
                    {uploadProgress.uploadedFiles.length} file(s) uploaded
                    successfully
                  </p>
                </div>
                <div className="space-y-2">
                  {uploadProgress.uploadedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-2 bg-white dark:bg-zinc-800 p-2 rounded"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="w-3 h-3 text-green-600 dark:text-green-400 shrink-0" />
                        <span className="text-xs text-green-700 dark:text-green-400 truncate">
                          {file.filename}
                        </span>
                      </div>
                      <a
                        href={file.public_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline shrink-0"
                      >
                        View
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-zinc-700 pt-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  MCP App Connections
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Connect apps your agents can use at runtime.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MCP_APPS.map((app) => {
                const connection = mcpConnections[app.id];
                const isConnected = Boolean(connection);

                return (
                  <div
                    key={app.id}
                    className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {app.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {app.description}
                        </p>
                      </div>
                      <span
                        className={`text-[11px] px-2 py-1 rounded-full border ${
                          isConnected
                            ? "text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-900/20 dark:border-green-700"
                            : "text-gray-600 bg-white border-gray-200 dark:text-gray-300 dark:bg-zinc-900 dark:border-zinc-700"
                        }`}
                      >
                        {isConnected ? "Connected" : "Not connected"}
                      </span>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant={isConnected ? "outline" : "default"}
                      className="mt-3 w-full"
                      onClick={() => openMcpModal(app)}
                    >
                      <Link2 className="w-4 h-4" />
                      {isConnected ? "Manage Connection" : "Connect"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <Button
        onClick={handleContinueToPermissions}
        disabled={isLoading}
        size="lg"
        className="w-full px-6 py-4 sm:px-8 sm:py-6 text-base bg-[#fc7249] hover:bg-[#fc7249]/90 text-white font-semibold cursor-pointer"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Processing...
          </>
        ) : (
          "Continue to Device Setup"
        )}
      </Button>

      {activeMcpApp && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center">
          <div className="w-full max-w-2xl rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
            <div className="flex items-start justify-between gap-4 p-5 border-b border-gray-200 dark:border-zinc-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Connect {activeMcpApp.name} via MCP
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Configure MCP server details and credentials.
                </p>
              </div>
              <button
                type="button"
                onClick={closeMcpModal}
                className="rounded-md p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    MCP Server URL
                  </label>
                  <Input
                    value={mcpDraft.serverUrl}
                    onChange={(e) =>
                      setMcpDraft((prev) => ({
                        ...prev,
                        serverUrl: e.target.value,
                      }))
                    }
                    placeholder="https://mcp.yourapp.com"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Workspace / Team ID
                  </label>
                  <Input
                    value={mcpDraft.workspaceId}
                    onChange={(e) =>
                      setMcpDraft((prev) => ({
                        ...prev,
                        workspaceId: e.target.value,
                      }))
                    }
                    placeholder="workspace-id"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Access Token
                  </label>
                  <Input
                    type="password"
                    value={mcpDraft.accessToken}
                    onChange={(e) =>
                      setMcpDraft((prev) => ({
                        ...prev,
                        accessToken: e.target.value,
                      }))
                    }
                    placeholder="Paste token"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Connection Notes
                  </label>
                  <Textarea
                    rows={3}
                    value={mcpDraft.notes}
                    onChange={(e) =>
                      setMcpDraft((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    placeholder="Optional notes for this integration"
                    className="resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 pt-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeMcpModal}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={saveMcpConnection}
                disabled={
                  !mcpDraft.serverUrl.trim() || !mcpDraft.accessToken.trim()
                }
                className="bg-[#fc7249] hover:bg-[#fc7249]/90 text-white"
              >
                Save Connection
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
