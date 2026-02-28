"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseSessionQueueOptions {
  sessionType: "pitch" | "feedback";
  onSessionReady?: (config: SessionConfig) => void;
  onQueueUpdate?: (status: QueueStatus) => void;
}

interface SessionConfig {
  anamSessionToken: string;
  elevenLabsAgentId: string;
  queueSessionId: string;
  error?: string;
}

interface QueueStatus {
  isQueued: boolean;
  position: number;
  estimatedWaitSeconds: number;
}

export function useSessionQueue({
  sessionType,
  onSessionReady,
  onQueueUpdate,
}: UseSessionQueueOptions) {
  const [isQueued, setIsQueued] = useState(false);
  const [queuePosition, setQueuePosition] = useState(0);
  const [estimatedWait, setEstimatedWait] = useState(0);
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const queueSessionIdRef = useRef<string | null>(null);
  const isRequestingRef = useRef(false);

  const apiEndpoint = sessionType === "pitch" ? "/api/pitch" : "/api/feedback";

  const requestSession = useCallback(async () => {
    if (isRequestingRef.current) {
      console.log("[Queue Hook] Request already in progress");
      return;
    }

    isRequestingRef.current = true;
    setError(null);

    try {
      console.log(`[Queue Hook] Requesting ${sessionType} session...`);
      setIsQueued(true);

      const response = await fetch(apiEndpoint);
      const config: SessionConfig = await response.json();

      if (!response.ok) {
        throw new Error(config.error || "Failed to get session config");
      }

      console.log(`[Queue Hook] Session ready:`, config);
      queueSessionIdRef.current = config.queueSessionId;
      setSessionConfig(config);
      setIsQueued(false);

      if (onSessionReady) {
        onSessionReady(config);
      }
    } catch (err) {
      console.error(`[Queue Hook] Error requesting session:`, err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsQueued(false);
    } finally {
      isRequestingRef.current = false;
    }
  }, [sessionType, apiEndpoint, onSessionReady]);

  const releaseSession = useCallback(async () => {
    const sessionId = queueSessionIdRef.current;
    if (!sessionId) {
      console.log("[Queue Hook] No session ID to release");
      return;
    }

    try {
      console.log(`[Queue Hook] Releasing session: ${sessionId}`);
      await fetch(apiEndpoint, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });
      queueSessionIdRef.current = null;
      setSessionConfig(null);
    } catch (err) {
      console.error("[Queue Hook] Error releasing session:", err);
    }
  }, [apiEndpoint]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (queueSessionIdRef.current) {
        releaseSession();
      }
    };
  }, [releaseSession]);

  // Notify parent of queue updates
  useEffect(() => {
    if (onQueueUpdate) {
      onQueueUpdate({
        isQueued,
        position: queuePosition,
        estimatedWaitSeconds: estimatedWait,
      });
    }
  }, [isQueued, queuePosition, estimatedWait, onQueueUpdate]);

  return {
    // State
    isQueued,
    queuePosition,
    estimatedWait,
    sessionConfig,
    error,

    // Actions
    requestSession,
    releaseSession,

    // Utils
    isReady: !!sessionConfig && !isQueued,
  };
}
