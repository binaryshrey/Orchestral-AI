"use client";

import { useRouter } from "next/navigation";

export default function ReviewNext() {
  const router = useRouter();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 lg:px-8 pb-8">
      <button
        onClick={() => router.push("/dashboard")}
        className="w-full py-3 rounded-lg bg-white text-black font-semibold hover:bg-white/90 transition-colors"
      >
        Finish
      </button>
    </div>
  );
}
