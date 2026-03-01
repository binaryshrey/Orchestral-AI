"use client";

import Link from "next/link";

export interface CTAProps {
  title?: string;
  title2?: string;
  description?: string;
  primaryButtonText?: string;
  primaryButtonHref?: string;
  secondaryButtonText?: string;
  secondaryButtonHref?: string;
}

export function CTA({
  title = "Command your workflows like an enterprise architect.",
  title2 = "Powered by visual telemetry and self-learning AI.",
  description = "Run complex workflows, debug multi-agent bottlenecks, and trigger automatic fine-tuning loops powered by Mistral and Weights & Biases.",
  primaryButtonText = "Get started",
  primaryButtonHref = "/sign-up",
  secondaryButtonText = "Learn more",
  secondaryButtonHref = "https://github.com/binaryshrey/Orchestral-AI",
}: CTAProps) {
  return (
    <section className="overflow-hidden bg-black py-20 pt-40 pb-40">
      <div className="mx-auto max-w-9xl px-12 lg:px-20">
        <div className="text-center">
          <h2 className="text-3xxl lg:text-3xl font-bold text-white">
            {title}
          </h2>
          <h2 className="text-3xxl lg:text-3xl font-bold text-white mb-6">
            {title2}
          </h2>
          <p className="text-sm lg:text-medium text-gray-300 mb-10 max-w-6xl mx-auto">
            {description}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href={primaryButtonHref}>
              <button className="cursor-pointer rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-black shadow-sm hover:bg-white/90 transition-colors">
                {primaryButtonText}
              </button>
            </Link>
            <a
              href={secondaryButtonHref}
              className="text-sm font-semibold leading-6 text-white"
            >
              {secondaryButtonText} <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export default CTA;
