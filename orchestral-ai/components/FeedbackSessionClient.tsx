"use client";

/**
 * ElevenLabs + Anam Integration Component for Feedback Session
 *
 * Client component that orchestrates the feedback session with AI coach
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@anam-ai/js-sdk";
import type AnamClient from "@anam-ai/js-sdk/dist/module/AnamClient";
import {
  connectElevenLabs,
  stopElevenLabs,
  setInitialAgentMessage,
} from "@/lib/elevenlabs";
import ProfileMenu from "./ProfileMenu";

interface Config {
  anamSessionToken: string;
  elevenLabsAgentId: string;
  queueSessionId?: string; // For releasing the queue slot
  error?: string;
}

interface Message {
  role: "user" | "agent" | "system";
  text: string;
}

interface FeedbackSessionClientProps {
  autoStart?: boolean;
  user: any; // User object from WorkOS
  embedded?: boolean; // true when rendered inside the dashboard layout
}

export default function FeedbackSessionClient({
  autoStart = false,
  user,
  embedded = false,
}: FeedbackSessionClientProps) {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isEnding, setIsEnding] = useState(false);
  const [endingMessage, setEndingMessage] = useState("");
  const isIntentionalDisconnectRef = useRef(false);

  const anamClientRef = useRef<AnamClient | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const hasAutoStarted = useRef(false);
  const configRef = useRef<Config | null>(null);
  const agentAudioInputStreamRef = useRef<any>(null);
  const anamSessionIdRef = useRef<string | null>(null);
  const queueSessionIdRef = useRef<string | null>(null); // Store queue session ID for cleanup
  const hasInitialized = useRef(false);
  const ttsSummaryRef = useRef<string | null>(null);
  const userStreamRef = useRef<MediaStream | null>(null);

  // Initialize session on mount - now safe with separate API key
  useEffect(() => {
    const initializeSession = async () => {
      // Prevent re-initialization if already initialized
      if (hasInitialized.current) {
        console.log("[Feedback Session] Already initialized, skipping...");
        return;
      }

      console.log("[Feedback Session] Initializing session...");
      hasInitialized.current = true;

      try {
        // Before initializing the feedback avatar, send the pitch transcript
        // to the feedback API so we can retrieve a concise TTS summary.
        try {
          if (typeof window !== "undefined") {
            const raw = sessionStorage.getItem("pitch_conversation");
            if (!raw) {
              throw new Error("No pitch conversation found in sessionStorage.");
            }

            const rawMessages: Message[] = JSON.parse(raw);

            // Normalize and build payload
            type RawMsg = { role: "system" | "agent" | "user"; text: string };
            type QAMsg = {
              role: "system" | "assistant" | "user";
              text: string;
            };

            const normalizeTranscript = (messages: RawMsg[]): QAMsg[] =>
              messages
                .map((m) => ({
                  role: (m.role === "agent"
                    ? "assistant"
                    : m.role) as QAMsg["role"],
                  text: (m.text ?? "").trim(),
                }))
                .filter((m) => m.text.length > 0) as unknown as QAMsg[];

            const buildPitchTextUserOnly = (messages: QAMsg[]) =>
              messages
                .filter((m) => m.role === "user")
                .map((m) => m.text)
                .join("\n\n");

            const qa_transcript = normalizeTranscript(rawMessages as RawMsg[]);
            const pitch_text = buildPitchTextUserOnly(qa_transcript);

            const payload: any = {
              pitch_text,
              top_k: 6,
              qa_transcript,
            };

            // Attach pitch session id (if present) so backend can persist
            // the generated feedback against the correct DB row.
            try {
              const pitchId = sessionStorage.getItem("pitch_session_id");
              if (pitchId) {
                payload.pitch_id = pitchId;
                console.log("Including pitch_id in feedback payload:", pitchId);
              }
            } catch (err) {
              console.warn(
                "Could not read pitch_session_id from sessionStorage:",
                err,
              );
            }

            // Resolve backend API base from env (client-safe NEXT_PUBLIC var)
            const apiBase = (
              process.env.NEXT_PUBLIC_DEMODAY_API_URI ||
              (process.env.DEMODAY_API_URI as string) ||
              ""
            ).replace(/\/$/, "");

            if (!apiBase) {
              throw new Error(
                "DEMODAY API URL not configured. Please set NEXT_PUBLIC_DEMODAY_API_URI in .env.local",
              );
            }

            console.log(
              `[Feedback] Sending transcript to ${apiBase}/pitch/feedback`,
              payload,
            );

            const fbRes = await fetch(`${apiBase}/pitch/feedback`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (!fbRes.ok) {
              const text = await fbRes.text().catch(() => fbRes.statusText);
              throw new Error(`Feedback API failed: ${fbRes.status} ${text}`);
            }

            const fbJson = await fbRes.json();
            console.log("[Feedback] Received feedback response:", fbJson);

            // Extract tts_summary and store for speaking later
            if (fbJson?.tts_summary) {
              ttsSummaryRef.current = fbJson.tts_summary;
              // Make sure the elevenlabs lib knows about the initial message
              // as soon as we have it (handles before/after connect cases).
              try {
                setInitialAgentMessage(fbJson.tts_summary);
              } catch (err) {
                console.warn(
                  "[Feedback] Failed to set initial agent message:",
                  err,
                );
              }
            }
          }
        } catch (err) {
          console.error("[Feedback] Error while sending transcript:", err);
          showError(
            err instanceof Error ? err.message : "Failed to evaluate pitch.",
          );
          // Abort initialization if feedback call failed
          hasInitialized.current = false;
          setIsInitializing(false);
          return;
        }

        // Clean up any existing sessions
        if (anamClientRef.current) {
          try {
            console.log("[Feedback Session] Cleaning up existing session...");
            await anamClientRef.current.stopStreaming();
            anamClientRef.current = null;
          } catch (err) {
            console.error("[Feedback Session] Error cleaning up:", err);
          }
        }

        // Fetch fresh config and initialize Anam avatar with coach
        console.log("[Feedback Session] Fetching config from /api/feedback...");
        const res = await fetch("/api/feedback");
        console.log(
          "[Feedback Session] Received response:",
          res.status,
          res.ok,
        );
        const config: Config = await res.json();
        console.log("[Feedback Session] Config parsed:", {
          hasToken: !!config.anamSessionToken,
          hasAgentId: !!config.elevenLabsAgentId,
          hasQueueId: !!config.queueSessionId,
          error: config.error,
        });

        if (!res.ok) {
          throw new Error(config.error || "Failed to get config");
        }

        // Store the queue session ID for cleanup
        if (config.queueSessionId) {
          queueSessionIdRef.current = config.queueSessionId;
          console.log("[Queue] Acquired session slot:", config.queueSessionId);
        }

        console.log(
          "[Anam] Initializing coach avatar with fresh session token",
        );

        // Initialize Anam avatar
        const anamClient = createClient(config.anamSessionToken, {
          disableInputAudio: true,
        });

        if (videoRef.current) {
          await anamClient.streamToVideoElement(videoRef.current.id);
          const sessionId = anamClient.getActiveSessionId();
          anamSessionIdRef.current = sessionId;
          console.log("[Anam] Coach avatar ready, session:", sessionId);
        }

        // Create audio input stream and keep it ready
        const agentAudioInputStream = anamClient.createAgentAudioInputStream({
          encoding: "pcm_s16le",
          sampleRate: 16000,
          channels: 1,
        });

        anamClientRef.current = anamClient;
        agentAudioInputStreamRef.current = agentAudioInputStream;
        configRef.current = config;
        setShowVideo(true);

        console.log("[Feedback Session] Coach avatar initialized and ready");

        // Small delay to let avatar settle
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        console.error("[Feedback Session] Initialization error:", err);
        showError(err instanceof Error ? err.message : "Failed to initialize");
        // Reset initialization flag on error so user can retry
        hasInitialized.current = false;
      } finally {
        setIsInitializing(false);
      }
    };

    initializeSession();
  }, []);

  // Auto-start if enabled
  useEffect(() => {
    if (
      autoStart &&
      !hasAutoStarted.current &&
      !isConnected &&
      !isLoading &&
      !isInitializing &&
      hasInitialized.current
    ) {
      hasAutoStarted.current = true;
      console.log("[Feedback Session] Auto-starting session...");
      // Small delay so user sees the avatar before agent speaks
      setTimeout(() => {
        handleStart();
      }, 500);
    }
  }, [autoStart, isInitializing, isConnected]);

  useEffect(() => {
    // Auto-scroll transcript to bottom
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages]);

  // Cleanup on unmount - silent cleanup without feedback
  useEffect(() => {
    return () => {
      isIntentionalDisconnectRef.current = true; // Mark as intentional on unmount
      stopElevenLabs();
      if (anamClientRef.current) {
        anamClientRef.current.stopStreaming();
      }
      // Release the queue session slot
      releaseQueueSession();
      // Reset initialization flag on unmount to allow re-initialization on remount
      hasInitialized.current = false;
      // Stop user camera stream
      if (userStreamRef.current) {
        userStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Initialize user camera
  useEffect(() => {
    const initUserCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
          audio: false,
        });
        userStreamRef.current = stream;
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("[Camera] Failed to access user camera:", err);
      }
    };

    initUserCamera();

    return () => {
      if (userStreamRef.current) {
        userStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Release queue session slot
  const releaseQueueSession = async () => {
    const sessionId = queueSessionIdRef.current;
    if (!sessionId) {
      console.log("[Queue] No session ID to release");
      return;
    }

    try {
      console.log("[Queue] Releasing session slot:", sessionId);
      const response = await fetch("/api/feedback", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });

      if (response.ok) {
        console.log("[Queue] Session released successfully");
        queueSessionIdRef.current = null;
      } else {
        console.error(
          "[Queue] Failed to release session:",
          await response.text(),
        );
      }
    } catch (err) {
      console.error("[Queue] Error releasing session:", err);
    }
  };

  const addMessage = (role: "user" | "agent" | "system", text: string) => {
    setMessages((prev) => [...prev, { role, text }]);
  };

  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 5000);
  };

  const resolveProjectName = (): string => {
    if (typeof window === "undefined") return "this project";
    try {
      const raw = sessionStorage.getItem("agent_plan_context");
      if (raw) {
        const parsed = JSON.parse(raw) as { project_name?: string };
        const projectName = parsed.project_name?.trim();
        if (projectName) return projectName;
      }
    } catch {
      // Ignore malformed context
    }
    return "this project";
  };

  const handleStart = async () => {
    setIsLoading(true);
    isIntentionalDisconnectRef.current = false; // Reset the flag

    try {
      // Use pre-initialized config and streams
      if (
        !configRef.current ||
        !anamClientRef.current ||
        !agentAudioInputStreamRef.current
      ) {
        throw new Error("Session not initialized. Please try again.");
      }

      console.log(
        "[ElevenLabs] Connecting with pre-initialized coach avatar...",
      );

      // Connect to ElevenLabs using the pre-initialized audio stream
      await connectElevenLabs(
        configRef.current.elevenLabsAgentId,
        {
          onReady: () => {
            setIsConnected(true);
            addMessage(
              "system",
              "Connected. Your AI coach is ready to provide feedback.",
            );
          },
          onAudio: (audio: string) => {
            agentAudioInputStreamRef.current?.sendAudioChunk(audio);
          },
          onUserTranscript: (text: string) => addMessage("user", text),
          onAgentResponse: (text: string) => {
            addMessage("agent", text);
          },
          onInterrupt: () => {
            addMessage("system", "Interrupted");
            anamClientRef.current?.interruptPersona();
            agentAudioInputStreamRef.current?.endSequence();
          },
          onDisconnect: () => {
            // Only set isConnected to false if this was an intentional disconnect
            if (isIntentionalDisconnectRef.current) {
              setIsConnected(false);
            }
          },
          onError: () => showError("Connection error"),
          // pass the tts summary so ElevenLabs lib can inject it once ready
        },
        ttsSummaryRef.current ?? undefined,
        {
          dynamicVariables: {
            project_name: resolveProjectName(),
          },
        },
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    // Mark this as an intentional disconnect
    isIntentionalDisconnectRef.current = true;

    // Show ending sequence
    setIsEnding(true);
    setEndingMessage("Ending session.");

    // Stop connections properly
    stopElevenLabs();

    if (anamClientRef.current) {
      try {
        await anamClientRef.current.stopStreaming();
        console.log("[Feedback Session] Anam streaming stopped successfully");
      } catch (err) {
        console.error("[Feedback Session] Error stopping Anam streaming:", err);
      }
    }

    setShowVideo(false);
    setIsConnected(false);

    // Release the queue session slot immediately
    await releaseQueueSession();

    // Change message
    setEndingMessage("Returning to dashboard.");

    // Wait a moment for connections to fully close
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Clean up client reference
    anamClientRef.current = null;

    const pitchId = sessionStorage.getItem("pitch_session_id") || sessionStorage.getItem("pitch_id");
    console.log("[Feedback Session] Navigating to analysis");
    if (pitchId) {
      router.push(`/dashboard/analysis?id=${encodeURIComponent(pitchId)}`);
    } else {
      router.push("/dashboard");
    }
  };

  const handleToggle = () => {
    if (isConnected) {
      handleStop();
    } else {
      handleStart();
    }
  };

  const getMessageLabel = (role: string) => {
    switch (role) {
      case "user":
        return "You";
      case "agent":
        return "Coach";
      default:
        return "•";
    }
  };

  return (
    <div
      className={`${embedded ? "relative w-full h-full" : "fixed inset-0"} flex items-center justify-center`}
      style={{ backgroundColor: "#000" }}
    >
      {/* Navigation Header */}
      <div className="absolute top-0 left-0 right-0 z-50 px-6 pt-4 lg:px-8">
        <nav className="flex flex-col items-center gap-2">
          {!embedded && (
            <div className="w-full flex items-center justify-between">
              <a href="/dashboard" className="-m-1.5 p-1.5">
                <img
                  className="h-8 drop-shadow-lg"
                  src="/logo-light.svg"
                  alt="demoday-ai"
                />
              </a>
              <ProfileMenu user={user} />
            </div>
          )}
          <h1 className="text-white text-3xl font-medium">
            DemoDay AI Investor Pitch Feedback
          </h1>
        </nav>
      </div>

      {/* Ending Loader - Blocks UI */}
      {isEnding && (
        <div className="absolute inset-0 bg-black z-50 flex flex-col items-center justify-center">
          <div className="relative">
            {/* Spinner */}
            <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
          </div>
          <p className="text-white text-lg mt-6 font-medium">{endingMessage}</p>
          <p className="text-white/60 text-sm mt-2">Please wait...</p>
        </div>
      )}

      {/* Initialization Loader - Blocks UI */}
      {isInitializing && (
        <div className="absolute inset-0 bg-black z-50 flex flex-col items-center justify-center">
          <div className="relative">
            {/* Spinner */}
            <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
          </div>
          <p className="text-white text-lg mt-6 font-medium">
            Initializing Feedback Session.
          </p>
          <p className="text-white/60 text-sm mt-2">Preparing your AI coach</p>
        </div>
      )}

      {/* Connecting Overlay - Shows when starting */}
      {isLoading && !isInitializing && (
        <div className="absolute inset-0 bg-black/50 z-40 flex flex-col items-center justify-center backdrop-blur-sm">
          <div className="relative">
            {/* Spinner */}
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
          </div>
          <p className="text-white text-lg mt-4 font-medium">
            Starting Session.
          </p>
          <p className="text-white/60 text-sm mt-2">
            Connecting to your coach.
          </p>
        </div>
      )}

      {/* Scaled Video Container - Centered with rounded corners */}
      <div
        className="relative w-full max-w-5xl aspect-video bg-black"
        style={{ borderRadius: "20px", overflow: "hidden" }}
      >
        <video
          ref={videoRef}
          id="anam-video-feedback"
          className="w-full h-full object-cover"
          autoPlay
          playsInline
        />
      </div>

      {/* Placeholder when not streaming */}
      {!showVideo && !isInitializing && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ backgroundColor: "#000" }}
        >
          <div className="relative w-32 h-32 mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-purple-700 transition-colors duration-300" />
            <div className="absolute inset-2 rounded-full bg-purple-900/30 flex items-center justify-center">
              <svg
                className="w-12 h-12 text-purple-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 22.5l-.394-1.933a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423L16.5 15l.394 1.933a2.25 2.25 0 001.423 1.423L19.5 18.75l-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                />
              </svg>
            </div>
          </div>
          {isLoading ? (
            <>
              <p className="text-white text-xl font-medium mb-2">
                Initializing.
              </p>
              <p className="text-white/60 text-sm">
                Setting up your feedback session
              </p>
            </>
          ) : isConnected ? (
            <>
              <p className="text-white text-xl font-medium mb-2">Listening</p>
              <p className="text-white/60 text-sm">Your coach is ready</p>
            </>
          ) : (
            <>
              <p className="text-white text-xl font-medium mb-3">
                Pitch Complete! 🎉
              </p>
              <p className="text-white/70 text-sm mb-2">
                Great job on your pitch!
              </p>
              <p className="text-white/50 text-xs max-w-md text-center">
                When you're ready, start a feedback session with your AI coach
                to review your performance and get personalized tips.
              </p>
            </>
          )}
        </div>
      )}

      {/* Transcript - Bottom Left (Glass Effect) */}
      <div className="absolute bottom-6 left-6 max-w-md w-full max-h-64 overflow-hidden">
        <div
          ref={transcriptRef}
          className="bg-white/5 backdrop-blur-2xl border border-white/30 rounded-xl p-4 space-y-2 overflow-y-auto max-h-64 shadow-2xl"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,255,255,0.4) transparent",
            boxShadow:
              "0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)",
          }}
        >
          {messages.length === 0 ? (
            <p className="text-white/60 text-xs">
              Conversation will appear here.
            </p>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className="animate-fade-in">
                <span
                  className={`font-semibold ${
                    msg.role === "user"
                      ? "text-blue-400"
                      : msg.role === "agent"
                        ? "text-purple-400"
                        : "text-white/60"
                  }`}
                >
                  {getMessageLabel(msg.role)}:
                </span>{" "}
                <span className="text-white/90 text-sm">{msg.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* User Video Preview - Bottom Right */}
      <div className="absolute bottom-6 right-6 w-64 h-40 overflow-hidden">
        <div
          className="relative w-full h-full bg-white/5 backdrop-blur-2xl border border-white/30 rounded-xl shadow-2xl"
          style={{
            boxShadow:
              "0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)",
          }}
        >
          <video
            ref={userVideoRef}
            className="w-full h-full object-cover rounded-xl"
            style={{ transform: "scaleX(-1)" }}
            autoPlay
            playsInline
            muted
          />
          <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md">
            <span className="text-white/90 text-xs font-medium">You</span>
          </div>
        </div>
      </div>

      {/* Go to Dashboard Button - Bottom Center */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <button
          onClick={handleToggle}
          disabled={isLoading}
          className="px-10 py-3 rounded-full font-semibold text-white shadow-2xl transition-all transform flex items-center gap-3 cursor-pointer disabled:bg-gray-600 disabled:cursor-not-allowed disabled:hover:scale-100"
          style={{
            backgroundColor: isLoading
              ? "#4b5563"
              : isConnected
                ? "#fc7249"
                : "#8b5cf6",
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.currentTarget.style.backgroundColor = isConnected
                ? "#ff4000"
                : "#7c3aed";
            }
          }}
          onMouseLeave={(e) => {
            if (!isLoading) {
              e.currentTarget.style.backgroundColor = isConnected
                ? "#fc7249"
                : "#8b5cf6";
            }
          }}
        >
          {isLoading ? (
            <>
              <svg
                className="w-5 h-5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Connecting.</span>
            </>
          ) : isConnected ? (
            <>
              <span>Continue to Feedback Analysis</span>
            </>
          ) : (
            <>
              <span>Start Feedback Session</span>
            </>
          )}
        </button>
      </div>

      {/* Speaking Indicator - Center Bottom */}
      {isConnected && showVideo && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex items-end gap-1.5 h-10">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-1.5 bg-purple-400 rounded-full animate-pulse shadow-lg"
              style={{
                height: `${40 + i * 12}%`,
                animationDelay: `${i * 100}ms`,
              }}
            />
          ))}
        </div>
      )}

      {/* Error Display - Top Center */}
      {error && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 max-w-md">
          <div className="bg-red-600/90 backdrop-blur-md border border-red-400 rounded-lg px-6 py-3 shadow-xl">
            <p className="text-white text-sm font-medium">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
