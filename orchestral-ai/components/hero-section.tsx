import React from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedGroup } from "@/components/ui/animated-group";
import { HeroHeader } from "./header";
import { HeroVideoDialog } from "./ui/hero-video-dialog";
import { Highlighter } from "@/components/ui/highlighter";
import { Component } from "@/components/ui/etheral-shadow";

const transitionVariants = {
  item: {
    hidden: {
      opacity: 0,
      y: 12,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        bounce: 0.3,
        duration: 0.4,
      },
    },
  },
};

export default function HeroSection() {
  return (
    <div className="relative text-gray-900 dark:text-white min-h-screen overflow-hidden">
      {/* Ethereal shadow background */}
      <div className="absolute inset-0 -z-10 mask-[linear-gradient(to_bottom,black_40%,transparent_75%)]">
        <Component
          color="rgba(128, 128, 128, 1)"
          animation={{ scale: 40, speed: 30 }}
          noise={{ opacity: 1, scale: 1.2 }}
          sizing="fill"
        />
      </div>

      <HeroHeader />
      <main className="overflow-hidden">
        <section>
          <div className="relative pt-24 md:pt-36">
            <div className="mx-auto max-w-9xl px-6">
              <div className="text-center sm:mx-auto lg:mr-auto lg:mt-0">
                <AnimatedGroup variants={transitionVariants}>
                  <Link
                    href="https://worldwide-hackathon.mistral.ai/"
                    rel="noopener noreferrer"
                    target="_blank"
                    className="hover:bg-background dark:hover:bg-zinc-900 dark:hover:border-t-border bg-muted dark:bg-zinc-800 group mx-auto flex w-fit items-center gap-4 rounded-full border dark:border-white/10 p-1 pl-4 shadow-md shadow-zinc-950/5 transition-colors duration-300 dark:border-t-white/5 dark:shadow-zinc-950"
                  >
                    <span className="text-foreground dark:text-white text-sm">
                      Mistral AI Worldwide Hackathon - NewYork🗽
                    </span>
                    <span className="dark:border-background block h-4 w-0.5 border-l bg-gray-300 dark:bg-zinc-700"></span>

                    <div className="bg-background dark:bg-black group-hover:bg-muted dark:group-hover:bg-zinc-800 size-6 overflow-hidden rounded-full duration-500">
                      <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                        <span className="flex size-6">
                          <ArrowRight className="m-auto size-3" />
                        </span>
                        <span className="flex size-6">
                          <ArrowRight className="m-auto size-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </AnimatedGroup>

                <h1 className="mx-auto mt-8 max-w-8xl text-balance text-2xl font-bold md:text-6xl lg:mt-16 dark:text-white">
                  <span className="relative inline-block px-3 py-0.5 sm:px-3.5 sm:py-1.5">
                    <span className="absolute inset-0 bg-(--brand-primary) rounded-lg sm:rounded-xl sm:p-6"></span>
                    <span className="relative">Orchestrate</span>
                  </span>{" "}
                  Your Agents, Automate Your Workflows & <br /> Scale Your{" "}
                  <span className="relative inline-block px-3 py-0.5 sm:px-3.5 sm:py-1.5">
                    <span className="absolute inset-0 bg-(--brand-primary) rounded-lg sm:rounded-xl sm:p-6"></span>
                    <span className="relative">Success!</span>
                  </span>
                </h1>
                <p className="mx-auto mt-8 max-w-6xl text-balance text-xl dark:text-gray-300">
                  Orchestrate your{" "}
                  <Highlighter action="underline" color="#ff6632">
                    autonomous swarm of self-improving AI agents
                  </Highlighter>{" "}
                  with gamified real-time visual telemetry <br />
                  powered by{" "}
                  <Highlighter action="underline" color="#ff6632">
                    Mistral AI models
                  </Highlighter>{" "}
                  and{" "}
                  <Highlighter action="underline" color="#ff6632">
                    seamless MCP tool connections
                  </Highlighter>{" "}
                  to scale automation -{" "}
                  <Highlighter action="underline" color="#ff6632">
                    built with Mistral Vibe
                  </Highlighter>
                </p>

                <AnimatedGroup
                  variants={{
                    container: {
                      visible: {
                        transition: {
                          staggerChildren: 0.05,
                          delayChildren: 0.1,
                        },
                      },
                    },
                    ...transitionVariants,
                  }}
                  className="mt-12 flex flex-col items-center justify-center gap-2 md:flex-row"
                >
                  <div
                    key={1}
                    className="bg-foreground/10 rounded-[calc(var(--radius-xl)+0.125rem)] border p-0.5"
                  >
                    <Button
                      asChild
                      size="lg"
                      className="rounded-xl px-5 text-base"
                    >
                      <Link href="/sign-up">
                        <span className="text-nowrap">Get Started</span>
                      </Link>
                    </Button>
                  </div>
                  <Button
                    key={2}
                    asChild
                    size="lg"
                    variant="ghost"
                    className="h-10.5 rounded-xl px-5"
                  >
                    <Link href="https://github.com/binaryshrey/Orchestral-AI">
                      <span className="text-nowrap">Learn More →</span>
                    </Link>
                  </Button>
                </AnimatedGroup>
              </div>
            </div>

            <AnimatedGroup
              variants={{
                container: {
                  visible: {
                    transition: {
                      staggerChildren: 0.05,
                      delayChildren: 0.1,
                    },
                  },
                },
                ...transitionVariants,
              }}
            >
              <div className="mask-b-from-55% relative -mr-56 mt-8 overflow-hidden px-2 sm:mr-0 sm:mt-12 md:mt-12">
                <div className="inset-shadow-2xs ring-background dark:ring-white/20 dark:inset-shadow-white/20 bg-background dark:bg-black relative mx-auto max-w-6xl overflow-hidden rounded-2xl border dark:border-white/10 p-4 shadow-lg shadow-zinc-950/15 ring-1">
                  <HeroVideoDialog
                    className=" dark:block"
                    animationStyle="from-center"
                    videoSrc="https://www.youtube.com/embed/qh3NGpYRG3I?si=4rb-zSdDkVK9qxxb"
                    thumbnailSrc="/mail2.png"
                    thumbnailAlt="Hero Video"
                  />
                </div>
              </div>
            </AnimatedGroup>
          </div>
        </section>
        <section className="bg-background dark:bg-black pb-4 pt-4 md:pb-8">
          <div className="group relative m-auto max-w-5xl px-6">
            <div className="absolute inset-0 z-10 flex scale-95 items-center justify-center opacity-0 duration-500 group-hover:scale-100 group-hover:opacity-100">
              <Link
                href="/"
                className="block text-sm duration-150 hover:opacity-75 dark:text-white"
              >
                <span> Meet Our Customers</span>

                <ChevronRight className="ml-1 inline-block size-3" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
