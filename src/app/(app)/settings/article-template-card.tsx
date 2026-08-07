"use client";

import { useRef, useState, useTransition } from "react";
import { SquarePen } from "lucide-react";
import { saveArticleTemplateAction } from "./actions";
import type { FormatRules } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Section } from "./section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The article template, presented as a record rather than a form.
 *
 * This is the most consequential setting in the product and the least often
 * changed: it is the instruction every article is written from. Two open input
 * fields made it look as casually editable as a display name, so it now reads
 * back at rest and only becomes a form on deliberate intent — the same posture
 * as the content directions, which cannot be edited here at all.
 *
 * The textarea shows the SAVED prompt, never `articlePrompt()`. That helper
 * appends a derived "Required target length" line for the model; round-tripping
 * it through the form would bake the line into storage and append another on
 * every subsequent save.
 */
export function ArticleTemplateCard({ template }: { template: FormatRules }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const prompt = template.prompt ?? "";

  // Submitted from the client so edit mode can close only once the save has
  // actually landed — a plain server-action form would revalidate underneath
  // us and leave the fields open with no signal that anything happened.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    start(async () => {
      await saveArticleTemplateAction(data);
      setEditing(false);
    });
  }

  return (
    <Section
      title="Article template"
      description="The instructions every article is written from. Rarely needs changing."
      action={
        !editing ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <SquarePen data-icon="inline-start" />
            Edit
          </Button>
        ) : undefined
      }
    >
      <div>
        {editing ? (
          <form
            ref={formRef}
            onSubmit={onSubmit}
            className="grid gap-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
          >
            <div className="grid gap-2">
              <Label htmlFor="article-template-length">Target length</Label>
              <Input
                id="article-template-length"
                name="length"
                required
                defaultValue={template.length}
                placeholder="e.g. 1200-2000 words"
                className="sm:max-w-64"
              />
              <p className="text-xs text-ink-3">
                Written into the prompt on every generation. Plain numbers read most reliably.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="article-template-prompt">Prompt</Label>
              <Textarea
                id="article-template-prompt"
                name="prompt"
                required
                defaultValue={prompt}
                className="min-h-64 leading-relaxed"
                placeholder="Describe the structure, editorial standards, and rules the model should follow…"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs text-ink-3">
                Applies to every article generated from now on. Drafts that already exist are untouched.
              </p>
              <div className="ml-auto flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save template"}
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <div className="grid gap-5">
            <Fact label="Target length">
              <p className="text-sm font-medium text-ink">{template.length}</p>
            </Fact>

            <Fact label="Prompt">
              {prompt ? (
                /* Scrolls rather than clamps: the whole instruction is the
                   thing being reviewed, so none of it is hidden behind a
                   "show more" the reader has to trust. */
                <div className="max-h-56 overflow-y-auto rounded-xl bg-surface p-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
                    {prompt}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Using the built-in default template.
                </p>
              )}
            </Fact>
          </div>
        )}
      </div>
    </Section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-ink-3">{label}</span>
      {children}
    </div>
  );
}
