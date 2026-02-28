"use client";

import { useEffect, useState } from "react";

interface QueueStatusProps {
  isQueued: boolean;
  position?: number;
  estimatedWaitSeconds?: number;
  sessionType?: "pitch" | "feedback";
}

export default function QueueStatus({
  isQueued,
  position = 1,
  estimatedWaitSeconds = 0,
  sessionType = "pitch",
}: QueueStatusProps) {
  const [waitTime, setWaitTime] = useState(estimatedWaitSeconds);

  useEffect(() => {
    if (!isQueued || waitTime <= 0) return;

    const interval = setInterval(() => {
      setWaitTime((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [isQueued, waitTime]);

  if (!isQueued) return null;

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-linear-to-br from-gray-900 to-gray-800 border border-gray-700 rounded-2xl p-8 max-w-md w-full shadow-2xl">
        {/* Animated spinner */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-gray-700 rounded-full"></div>
            <div className="absolute top-0 left-0 w-20 h-20 border-4 border-t-blue-500 border-r-blue-500 rounded-full animate-spin"></div>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-white text-center mb-2">
          Session Queue
        </h2>

        {/* Message */}
        <p className="text-gray-300 text-center mb-6">
          {position === 1
            ? "You're next in line! Starting your session shortly..."
            : `Another user is currently in a ${
                sessionType === "pitch" ? "pitch" : "feedback"
              } session.`}
        </p>

        {/* Queue details */}
        <div className="space-y-4 bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">Your Position</span>
            <span className="text-2xl font-bold text-blue-400">
              #{position}
            </span>
          </div>

          {waitTime > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Estimated Wait</span>
              <span className="text-xl font-semibold text-gray-200">
                {formatTime(waitTime)}
              </span>
            </div>
          )}

          <div className="pt-4 border-t border-gray-700">
            <div className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-blue-400 mt-0.5 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-gray-400 text-sm">
                Keep this window open. Your session will start automatically
                when it's your turn.
              </p>
            </div>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="mt-6">
          <div className="flex gap-2 justify-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
