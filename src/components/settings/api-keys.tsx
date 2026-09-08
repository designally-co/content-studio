"use client";

import { useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { SavedApiKey } from "@/lib/secrets";
import { saveApiKeyAction, deleteApiKeyAction } from "./actions";
import { Section } from "./section";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Credentials for image generation.
 *
 * `onSaved` is how the list stays honest. As a page this re-rendered on the
 * server after every write; inside a sheet there is no navigation to hang that
 * on, so adding a key would leave the list showing the state from before it was
 * added until the sheet was closed and opened again. It asks for the data back
 * instead.
 */
export function ApiKeys({ keys, onSaved }: { keys: SavedApiKey[]; onSaved: () => void }) {
  const [pending, start] = useTransition();

  function submit(action: (data: FormData) => Promise<void>, data: FormData, form?: HTMLFormElement) {
    start(async () => {
      await action(data);
      form?.reset();
      onSaved();
    });
  }

  return (
    <Section
      title="API keys"
      description="For image generation. Encrypted, and never shown again."
    >
      <div className="space-y-4">
        {keys.length > 0 && (
          <div className="divide-y divide-(--sheet-line)">
            {keys.map((key) => (
              <div key={key.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{key.label}</span>
                  <code className="mt-0.5 block text-xs text-ink-3">{key.masked}</code>
                </div>
                <DeleteConfirm
                  title={`Delete “${key.label}”?`}
                  description="This key will no longer be available for image generation."
                  disabled={pending}
                  onConfirm={() => {
                    const data = new FormData();
                    data.set("id", key.id);
                    submit(deleteApiKeyAction, data);
                  }}
                />
              </div>
            ))}
          </div>
        )}
        {/* One provider exists, so there is no provider choice to make — the
            field names it instead of asking. */}
        <div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              submit(saveApiKeyAction, new FormData(form), form);
            }}
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
          >
            <input type="hidden" name="provider" value="fal" />
            <div className="grid gap-2">
              <Label htmlFor="api-key-value">Fal.ai API key</Label>
              <Input
                id="api-key-value"
                type="password"
                name="apiKey"
                required
                placeholder="Paste API key"
                autoComplete="new-password"
                className="font-mono"
              />
            </div>
            <Button type="submit" variant="outline" disabled={pending}>
              <Plus data-icon="inline-start" /> {pending ? "Saving…" : "Save key"}
            </Button>
            {/* Beside the one key field, because this is where the question is
                actually asked: why is there nowhere to put the Anthropic key?
                It was a third sentence in the section subline, where it made
                the heading three lines deep to answer something nobody had
                thought to wonder yet. */}
            <p className="text-xs text-ink-3 sm:col-span-2">
              Anthropic is configured in the server environment, not here.
            </p>
          </form>
        </div>
      </div>
    </Section>
  );
}

function DeleteConfirm({
  title,
  description,
  onConfirm,
  disabled,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={title} disabled={disabled}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
          <AlertDialogAction type="button" variant="destructive" onClick={onConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
