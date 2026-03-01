"use client";

import dynamic from "next/dynamic";

const AgentsWorkflowNext = dynamic(() => import("./AgentsWorkflowNext"), {
  ssr: false,
});

export default AgentsWorkflowNext;
