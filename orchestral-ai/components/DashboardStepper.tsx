"use client";

import { useState } from "react";
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
  { title: "AI PM Meeting", href: "/dashboard/project-simulation" },
  { title: "AI Agents Workflow", href: "/dashboard/agents-workflow" },
];

interface DashboardStepperProps {
  /** 1 = Configure, 2 = AI PM Meeting, 3 = AI Agents Workflow */
  currentStep: number;
}

export function DashboardStepper({ currentStep }: DashboardStepperProps) {
  const [pitchSessionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return sessionStorage.getItem("pitch_session_id");
    } catch {
      return null;
    }
  });

  const steps = BASE_STEPS.map((step, index) => {
    if (!pitchSessionId) return step;
    if (index === 1) {
      return { ...step, href: `/dashboard/project-simulation?id=${pitchSessionId}` };
    }
    if (index === 2) {
      return { ...step, href: `/dashboard/agents-workflow?id=${pitchSessionId}` };
    }
    return step;
  });

  const activeStep = Math.min(Math.max(currentStep, 1), steps.length);

  return (
    <Stepper defaultValue={activeStep} className="space-y-8">
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
