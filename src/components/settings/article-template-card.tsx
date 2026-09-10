"use client";

import { useTransition } from "react";
import { saveArticleTemplateAction } from "./actions";
import { SettingsPanel } from "./panel";
import type { FormatRules } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The instruction every article is written from.
 *
 * THE ADVANCED-SETTINGS PANEL FROM THE ROUTINE SHEET. This is the most
 * consequential setting in the product and the least often changed — a thousand
 * words of instruction that sat open above everything else, so the one section
 * you almost never touch was the one you scrolled past every time. Folded away
 * it says what it is and stays shut until asked, exactly as the routine form
 * treats its own advanced fields: a bordered panel on the sheet's ground, a
 * heading and subline in the trigger, a chevron that turns.
 *
 * OPENING IT IS THE INTENT. It used to read back at rest behind an "Edit
 * template" button — a second act of consent for something you had already gone
 * two levels down to reach, and a read mode that showed the same text the form
 * would show, in a box you could not type in. Unfolding the panel already says
 * you came here to change this.
 *
 * The textarea shows the SAVED prompt, never `articlePrompt()`. That helper
 * appends a derived "Required target length" line for the model; round-tripping
 * it through the form would bake the line into storage and append another on
 * every subsequent save.
 */
export function ArticleTemplateCard({
  template,
  onSaved,
}: {
  template: FormatRules;
  /* Asks the sheet for the data back. As a page this re-rendered on the server
     after a save; in a sheet there is nothing to trigger that, so the panel
     would go on showing the values from before the save. */
  onSaved: () => void;
}) {
  const [pending, start] = useTransition();
  const prompt = template.prompt ?? "";

  // Submitted from the client so the save can be awaited before the panel is
  // told to reload — a plain server-action form would revalidate underneath us.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    start(async () => {
      await saveArticleTemplateAction(data);
      onSaved();
    });
  }

  return (
    <SettingsPanel
      title="Article template"
      description="Structure every article follows"
    >
      <form onSubmit={onSubmit} className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="article-template-length">Target length</Label>
          {/* Full width, like every other field in the sheet. Capped at 16rem
              it was the only control that stopped short of the margin, which
              read as a different KIND of field rather than a shorter one. */}
          <Input
            id="article-template-length"
            name="length"
            required
            defaultValue={template.length}
            placeholder="e.g. 1200-2000 words"
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-3">
            Applies to every article from now on. Existing drafts are untouched.
          </p>
          <Button type="submit" disabled={pending} className="ml-auto">
            {pending ? "Saving…" : "Save template"}
          </Button>
        </div>
      </form>
    </SettingsPanel>
  );
}
