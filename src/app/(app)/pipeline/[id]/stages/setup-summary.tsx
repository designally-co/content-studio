import Link from "next/link";
import type { ProjectInputs } from "@/db/schema";
import { StageShell } from "./stage-shell";
import { IconArrowRight } from "@/components/icons";

export function SetupSummary({
  projectId,
  brandName,
  categoryName,
  language,
  inputs,
}: {
  projectId: string;
  brandName: string;
  categoryName: string;
  language: string;
  inputs: ProjectInputs;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "Brand profile", value: brandName },
    { label: "Category", value: categoryName },
    { label: "Language", value: language },
  ];
  if (inputs.keyword) rows.push({ label: "Keyword(s)", value: inputs.keyword });

  return (
    <StageShell
      title="Setup"
      description="The choices this project was created with. Continue to topic suggestions."
    >
      <dl className="cs-card divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4 sm:px-5">
            <dt className="w-full shrink-0 text-sm text-ink-3 sm:w-40">{r.label}</dt>
            <dd className="text-sm text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>

      {(inputs.brief || inputs.competitorSummary || inputs.gscInsights) && (
        <div className="mt-4 space-y-4">
          {inputs.brief && (
            <Block label="Brief">{inputs.brief}</Block>
          )}
          {inputs.competitorSummary && (
            <Block label="Competitor reference">{inputs.competitorSummary}</Block>
          )}
          {inputs.gscInsights && (
            <Block label="Search Console insights" mono>
              {inputs.gscInsights}
            </Block>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Link href={`/pipeline/${projectId}?stage=2`} className="cs-btn-primary max-sm:w-full">
          Continue to topics
          <IconArrowRight width={16} height={16} />
        </Link>
      </div>
    </StageShell>
  );
}

function Block({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="cs-card p-5">
      <p className="cs-label">{label}</p>
      <p
        className={`whitespace-pre-wrap text-sm leading-relaxed text-ink-2 ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {children}
      </p>
    </div>
  );
}
