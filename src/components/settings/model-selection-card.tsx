"use client";

import { useState } from "react";
import { saveModelSettingsAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Section, Plate } from "./section";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Controlled so the picked models persist after saving. An uncontrolled Select
 * (defaultValue) gets reset to its mount-time default by React's server-action
 * form reset, which made saved choices appear to revert. Hidden inputs carry
 * the values so submission never depends on the Select's internal form field.
 */
export function ModelSelectionCard({
  textModels,
  settings,
}: {
  textModels: string[];
  settings: Record<string, string>;
}) {
  const [research, setResearch] = useState(
    settings["model.research"] ?? textModels[0] ?? ""
  );
  const [drafting, setDrafting] = useState(
    settings["model.drafting"] ?? textModels[0] ?? ""
  );

  return (
    <Section title="Model selection" description="Choose the models Content Studio uses for speed-sensitive and quality-sensitive tasks.">
      <Plate>
        <form action={saveModelSettingsAction} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="research" value={research} />
          <input type="hidden" name="drafting" value={drafting} />

          <div className="grid gap-2">
            <Label htmlFor="model-research">Research &amp; trends</Label>
            <Select value={research} onValueChange={setResearch}>
              <SelectTrigger id="model-research" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {textModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="model-drafting">Outline, drafts &amp; refinement</Label>
            <Select value={drafting} onValueChange={setDrafting}>
              <SelectTrigger id="model-drafting" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {textModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <Button type="submit">Save models</Button>
          </div>
        </form>
      </Plate>
    </Section>
  );
}
