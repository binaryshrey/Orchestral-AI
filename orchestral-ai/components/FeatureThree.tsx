"use client";

import Image from "next/image";
import Link from "next/link";

export interface FeatureThreeProps {
  title?: string;
  description?: string;
  imageSrc?: string;
  linkText?: string;
  linkHref?: string;
}

export function FeatureThree({
  title = "Use Advanced Voice Mode on your desktop",
  description = "Chat with your computer in real-time and get hands-free advice and answers while you work.",
  imageSrc = "/sample.png",
  linkText = "Learn more",
  linkHref = "#",
}: FeatureThreeProps) {
  return (
    <section className="overflow-hidden bg-black py-20">
      <div className="mx-auto max-w-8xl px-12 lg:px-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-0 items-center">
          {/* Left side - Text content */}
          <div className="flex flex-col justify-center lg:pr-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
              {title}
            </h2>
            <p className="text-lg text-gray-300 mb-8 leading-relaxed">
              {description}
            </p>
            <div>
              <Link
                href={linkHref}
                className="inline-flex items-center text-white hover:text-blue-300 transition-colors text-lg font-medium"
              >
                {linkText}
                <svg
                  className="ml-2 w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            </div>
          </div>

          {/* Right side - Image with gradient background */}
          <div className="relative lg:pl-8">
            <div className="relative rounded-2xl overflow-hidden">
              <Image
                src={imageSrc}
                alt={title}
                width={800}
                height={600}
                className="w-full h-auto rounded-2xl"
              />
              {/* Gradient overlay on bottom-right */}
              <div className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-gradient-to-tl from-yellow-400 via-pink-400 to-purple-400 opacity-40 blur-3xl rounded-tl-full"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default FeatureThree;
