"use client";

import { useState, useRef } from "react";
import { ArrowRight } from "lucide-react";

export default function ChatBar() {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (!message.trim()) return;
    // TODO: wire up to chat API
    setMessage("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };

  return (
    <div className="sticky bottom-0 px-4 pb-4 pt-2 lg:px-6">
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1a1a1a] px-4 py-3 shadow-lg">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about your pitch..."
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          style={{ maxHeight: "160px", overflowY: "auto" }}
        />

        {/* Send button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!message.trim()}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
        >
          <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
