"use client";

import Image from "next/image";

export interface FeatureOneProps {
  title?: string;
  description?: string;
  imageSrc?: string;
}

export function FeatureOne({
  title = "Built with forward-thinking teams",
  description = "Best-in-class AI and cloud infrastructure",
  imageSrc = "/sample.png",
}: FeatureOneProps) {
  return (
    <section className="overflow-hidden bg-black pb-20">
      <div className="mx-auto max-w-8xl px-12 lg:px-20">
        <div className="mb-12 text-center">
          <h2 className="mb-4 font-bold text-md text-white lg:text-3xl">
            {title}
          </h2>
          <p className="text-white/70 text-sm">{description}</p>
        </div>
        <div className="flex justify-center">
          <Image
            src={imageSrc}
            alt="Feature"
            width={1200}
            height={600}
            className="w-full max-w-8xl"
          />
        </div>
      </div>
    </section>
  );
}

export default FeatureOne;
