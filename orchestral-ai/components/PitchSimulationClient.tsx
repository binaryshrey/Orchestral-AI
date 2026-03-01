"use client";

/**
 * ElevenLabs + Anam Integration Component
 *
 * Client component that orchestrates the pitch simulation with AI investor
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@anam-ai/js-sdk";
import type AnamClient from "@anam-ai/js-sdk/dist/module/AnamClient";
import { connectElevenLabs, stopElevenLabs } from "@/lib/elevenlabs";
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

interface PitchSimulationClientProps {
  autoStart?: boolean;
  duration?: number; // Duration in minutes
  user: any; // User object from WorkOS
  embedded?: boolean; // true when rendered inside the dashboard layout
  pitchSessionId?: string; // DB session id passed from the URL
}

export default function PitchSimulationClient({
  autoStart = false,
  duration = 2,
  user,
  embedded = false,
  pitchSessionId,
}: PitchSimulationClientProps) {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(duration * 60); // Convert to seconds
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
  const userStreamRef = useRef<MediaStream | null>(null);

  // Initialize Anam session on mount (pre-warm the avatar)
  useEffect(() => {
    const initializeSession = async () => {
      // Prevent re-initialization if already initialized
      if (hasInitialized.current) {
        console.log("[Session] Already initialized, skipping...");
        return;
      }

      console.log("[Session] Initializing fresh session...");
      hasInitialized.current = true;

      try {
        // Clean up any existing sessions
        if (anamClientRef.current) {
          try {
            console.log("[Session] Cleaning up existing session...");
            await anamClientRef.current.stopStreaming();
            anamClientRef.current = null;
          } catch (err) {
            console.error("[Session] Error cleaning up:", err);
          }
        }

        // Fetch fresh config and initialize Anam avatar
        console.log("[Session] Fetching config from /api/pitch...");
        const res = await fetch("/api/pitch");
        console.log("[Session] Received response:", res.status, res.ok);
        const config: Config = await res.json();
        console.log("[Session] Config parsed:", {
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

        console.log("[Anam] Pre-initializing avatar with fresh session token");

        // Initialize Anam avatar immediately
        const anamClient = createClient(config.anamSessionToken, {
          disableInputAudio: true,
        });

        if (videoRef.current) {
          await anamClient.streamToVideoElement(videoRef.current.id);
          const sessionId = anamClient.getActiveSessionId();
          anamSessionIdRef.current = sessionId;
          console.log("[Anam] Avatar ready, session:", sessionId);
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

        console.log("[Session] Avatar initialized and ready");

        // Keep loader visible for a moment to let avatar settle
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        console.error("[Session] Initialization error:", err);
        showError(err instanceof Error ? err.message : "Failed to initialize");
        // Reset initialization flag on error so user can retry
        hasInitialized.current = false;
      } finally {
        setIsInitializing(false);
      }
    };

    initializeSession();
  }, []);

  useEffect(() => {
    // Auto-start if enabled and hasn't started yet
    if (
      autoStart &&
      !hasAutoStarted.current &&
      !isConnected &&
      !isLoading &&
      !isInitializing &&
      hasInitialized.current
    ) {
      hasAutoStarted.current = true;
      // Add a small delay so user sees the avatar before agent speaks
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

  // Countdown timer effect
  useEffect(() => {
    if (!isConnected || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Time's up - end the session with feedback
          clearInterval(interval);
          handleStopWithFeedback();
          addMessage("system", "Time's up. Session has ended!");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isConnected, timeRemaining]);

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

  // Format time remaining as HH:MM:SS
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Release queue session slot
  const releaseQueueSession = async () => {
    const sessionId = queueSessionIdRef.current;
    if (!sessionId) {
      console.log("[Queue] No session ID to release");
      return;
    }

    try {
      console.log("[Queue] Releasing session slot:", sessionId);
      const response = await fetch("/api/pitch", {
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
        throw new Error("Session not initialized. Please refresh the page.");
      }

      console.log("[ElevenLabs] Connecting with pre-initialized avatar...");

      // Connect to ElevenLabs using the pre-initialized audio stream
      await connectElevenLabs(configRef.current.elevenLabsAgentId, {
        onReady: () => {
          setIsConnected(true);
          addMessage("system", "Connected.");
        },
        onAudio: (audio: string) => {
          agentAudioInputStreamRef.current?.sendAudioChunk(audio);
        },
        onUserTranscript: (text: string) => addMessage("user", text),
        onAgentResponse: (text: string) => {
          agentAudioInputStreamRef.current?.endSequence();
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
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopWithFeedback = async () => {
    // Mark this as an intentional disconnect
    isIntentionalDisconnectRef.current = true;

    // Show ending sequence
    setIsEnding(true);
    setEndingMessage("Ending session.");

    // Stop connections properly
    stopElevenLabs();

    // Stop Anam streaming and ensure cleanup
    if (anamClientRef.current) {
      try {
        await anamClientRef.current.stopStreaming();
        console.log("[Session] Anam streaming stopped successfully");
      } catch (err) {
        console.error("[Session] Error stopping Anam streaming:", err);
      }
    }

    setShowVideo(false);
    setIsConnected(false);

    // Release the queue session slot immediately
    await releaseQueueSession();

    // Change message to saving
    setEndingMessage("Saving your pitch.");

    // Wait a moment for connections to fully close
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Clean up client reference
    anamClientRef.current = null;

    console.log("[Session] Navigating to agents workflow page");
    try {
      // Persist the full conversation so the feedback page can access it
      if (typeof window !== "undefined") {
        sessionStorage.setItem("pitch_conversation", JSON.stringify(messages));
        console.log("[Session] Saved conversation to sessionStorage");
      }
    } catch (err) {
      console.error("[Session] Failed to save conversation:", err);
    }

    const pitchId =
      pitchSessionId ??
      (() => {
        try {
          return sessionStorage.getItem("pitch_session_id");
        } catch {
          return null;
        }
      })();
    router.push(`/dashboard/agents-workflow${pitchId ? `?id=${pitchId}` : ""}`);
  };

  const handleToggle = () => {
    if (isConnected) {
      handleStopWithFeedback();
    } else {
      handleStart();
    }
  };

  const getMessageColor = (role: string) => {
    switch (role) {
      case "user":
        return "text-blue-600";
      case "agent":
        return "text-green-600";
      default:
        return "text-gray-500";
    }
  };

  const getMessageLabel = (role: string) => {
    switch (role) {
      case "user":
        return "You";
      case "agent":
        return "Investor";
      default:
        return "•";
    }
  };

  // Derive a friendly user name for greetings
  const userName =
    user && user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`.trim()
      : user && user.email
        ? String(user.email).split("@")[0]
        : "there";

  return (
    <div
      className={`${embedded ? "relative w-full h-full" : "fixed inset-0"} flex items-center justify-center`}
      style={{ backgroundColor: "#000" }}
    >
      {/* Navigation Header */}
      <div className="absolute top-0 left-0 right-0 z-50 px-6 lg:px-8">
        <nav className="flex flex-col items-center gap-2">
          {!embedded && (
            <div className="w-full flex items-center justify-between">
              <a href="/dashb/oard" className="-m-1.5 p-1.5">
                <img
                  className="h-8 drop-shadow-lg"
                  src="/logo-light.svg"
                  alt="orchestral-ai"
                />
              </a>
              <ProfileMenu user={user} />
            </div>
          )}
          <h1 className="text-white text-3xl font-medium">
            Orchestral AI Product Manager Meeting
          </h1>

          {/* Greeting + inline countdown (moves timer next to the text) */}
          <div className="flex items-center gap-4 mt-1">
            <p className="text-white/80 text-sm ">
              Hello, {userName}! Your meeting ends in
            </p>

            {/* Inline countdown block (same styling as previous top-right card) */}
            {isConnected && !isInitializing && (
              <div className="z-40">
                <div
                  className="bg-white/5 backdrop-blur-2xl border border-white/30 rounded-xl px-4 py-2 shadow-2xl"
                  style={{
                    boxShadow:
                      "0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className="w-5 h-5 text-white/80"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="text-sm text-white">
                      {formatTime(timeRemaining)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
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
            Initializing Session
          </p>
          <p className="text-white/60 text-sm mt-2">
            Preparing your pitch simulation
          </p>
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
            Starting Session...
          </p>
          <p className="text-white/60 text-sm mt-2">Get ready to pitch!</p>
        </div>
      )}

      {/* Scaled Video Container - Centered with rounded corners */}
      <div
        className="relative w-full max-w-5xl aspect-video bg-black"
        style={{ borderRadius: "20px", overflow: "hidden" }}
      >
        <video
          ref={videoRef}
          id="anam-video"
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
            <div className="absolute inset-0 rounded-full border-2 border-gray-700 transition-colors duration-300" />
            <div className="absolute inset-2 rounded-full bg-gray-800 flex items-center justify-center">
              <svg
                className="w-12 h-12 text-gray-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                />
              </svg>
            </div>
          </div>
          <p className="text-white text-lg">
            {isLoading
              ? "Connecting..."
              : isConnected
                ? "Listening"
                : "Ready to start"}
          </p>
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
                        ? "text-green-400"
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

      {/* End Call Button - Bottom Center */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <button
          onClick={handleToggle}
          disabled={isLoading}
          className={`px-10 py-3 rounded-full font-semibold ${
            isLoading ? "text-white" : "text-white"
          } shadow-2xl transition-all transform  flex items-center gap-3 cursor-pointer disabled:bg-gray-600 disabled:cursor-not-allowed disabled:hover:scale-100`}
          style={{
            backgroundColor: isLoading ? "#fc7249" : "#fc7249",
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.currentTarget.style.backgroundColor = "#fc7249";
            }
          }}
          onMouseLeave={(e) => {
            if (!isLoading) {
              e.currentTarget.style.backgroundColor = "#fc7249";
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
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h12v12H6z" />
              </svg>
              <span>End Your Pitch</span>
            </>
          ) : (
            <>
              <span>Begin Your Pitch</span>
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
              className="w-1.5 bg-green-400 rounded-full animate-pulse shadow-lg"
              style={{
                height: `${40 + i * 12}%`,
                animationDelay: `${i * 100}ms`,
              }}
            />
          ))}
        </div>
      )}

      {/* Error Toast - Top Right */}
      <div className="fixed top-6 right-6 z-50">
        {error && (
          <div className="max-w-xs">
            <div className="flex items-start gap-3 bg-red-600/95 backdrop-blur-md border border-red-400 rounded-lg px-4 py-3 shadow-xl animate-slide-in-right">
              <svg
                className="w-5 h-5 text-white/90 mt-0.5"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M12 9v4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 17h.01"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-white/80 hover:text-white ml-2"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
