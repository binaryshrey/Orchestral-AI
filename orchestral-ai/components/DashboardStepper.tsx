"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperTitle,
} from "@/components/ui/stepper";

const BASE_STEPS = [
  { title: "Configure", href: "/dashboard/onboard" },
  { title: "Pitch Simulation", href: "/dashboard/pitch-simulation" },
  { title: "Feedback", href: "/dashboard/feedback" },
  { title: "Analysis", href: "/dashboard/analysis" },
  { title: "Explore", href: "/dashboard/explore" },
];

interface DashboardStepperProps {
  /** 1 = Configure, 2 = Pitch Simulation, 3 = Feedback */
  currentStep: number;
}

export function DashboardStepper({ currentStep }: DashboardStepperProps) {
  const [pitchSessionId, setPitchSessionId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setPitchSessionId(sessionStorage.getItem("pitch_session_id"));
    } catch {}
  }, []);

  const steps = BASE_STEPS.map((step, index) => {
    if (!pitchSessionId) return step;
    // Append the session id to both Pitch Simulation and Feedback links
    if (index === 1) {
      return {
        ...step,
        href: `/dashboard/pitch-simulation?id=${pitchSessionId}`,
      };
    }
    if (index === 2) {
      return { ...step, href: `/dashboard/feedback?id=${pitchSessionId}` };
    }
    if (index === 3) {
      return { ...step, href: `/dashboard/analysis?id=${pitchSessionId}` };
    }
    if (index === 4) {
      return { ...step, href: `/dashboard/explore?id=${pitchSessionId}` };
    }
    return step;
  });

  return (
    <Stepper defaultValue={currentStep} className="space-y-8">
      <StepperNav className="gap-3.5 mb-8">
        {steps.map((step, index) => (
          <StepperItem
            key={index}
            step={index + 1}
            className="relative flex-1 items-start"
          >
            <Link
              href={step.href}
              className="flex flex-col items-start justify-center gap-3.5 grow"
            >
              <StepperIndicator className="bg-white/20 rounded-full h-1 w-full data-[state=active]:bg-white data-[state=completed]:bg-white" />
              <StepperTitle className="text-start font-semibold text-white group-data-[state=inactive]/step:text-white/50">
                {step.title}
              </StepperTitle>
            </Link>
          </StepperItem>
        ))}
      </StepperNav>
    </Stepper>
  );
}
