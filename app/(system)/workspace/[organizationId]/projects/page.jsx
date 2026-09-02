"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";

import ProjectsCommandCenter from "@/components/workspace/projects/ProjectsCommandCenter";

export default function ProjectsWorkspacePage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "").trim();

  return <ProjectsCommandCenter organizationId={organizationId} />;
}
