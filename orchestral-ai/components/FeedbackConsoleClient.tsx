"use client";

import { useEffect } from "react";

export default function FeedbackConsoleClient() {
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const raw = sessionStorage.getItem("pitch_conversation");
      if (!raw) {
        console.log(
          "[Feedback] No pitch conversation found in sessionStorage."
        );
        return;
      }

      const conversation = JSON.parse(raw);
      console.log("[Feedback] Pitch conversation:", conversation);
    } catch (err) {
      console.error("[Feedback] Error reading pitch conversation:", err);
    }
  }, []);

  return null;
}
