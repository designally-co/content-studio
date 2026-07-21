import type { ProjectStatus } from "@/db/schema";

const STAGE_LABEL = ["", "Setup", "Topics", "Outline", "Drafts", "Refine", "Finalize"];

export function StatusBadge({
  status,
  stage,
}: {
  status: ProjectStatus;
  stage: number;
}) {
  if (status === "finalized") return <Pill tone="ok">Finalized</Pill>;
  if (status === "rejected") return <Pill tone="danger">Rejected</Pill>;
  if (status === "in_pipeline")
    return <Pill tone="accent">In pipeline · {STAGE_LABEL[stage] ?? `Stage ${stage}`}</Pill>;
  return <Pill tone="muted">Draft</Pill>;
}

function Pill({
  tone,
  children,
}: {
  tone: "ok" | "danger" | "accent" | "muted";
  children: React.ReactNode;
}) {
  // Draft darkens badge text against its soft tint rather than reusing the
  // saturated ramp value, which would not clear AA on these backgrounds.
  const cls = {
    ok: "bg-ok-soft text-ok-ink",
    danger: "bg-danger-soft text-danger-ink",
    accent: "bg-accent-soft text-accent-press",
    muted: "bg-deep text-ink-2",
  }[tone];
  return (
    <span
      className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 font-sans text-xs font-semibold ${cls}`}
    >
      {children}
    </span>
  );
}
