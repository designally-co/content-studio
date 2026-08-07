import { asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { getDb } from "@/db";
import { appSettings, pricing } from "@/db/schema";
import { listApiKeys, type SavedApiKey } from "@/lib/secrets";
import { requireUser } from "@/lib/session";
import { saveApiKeyAction, deleteApiKeyAction } from "../actions";
import { ModelSelectionCard } from "../model-selection-card";
import { Section, Plate } from "../section";
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

/** Credentials and model routing. Admin-only, enforced here and in the actions. */
export default async function ApiSettingsPage() {
  const currentUser = await requireUser();
  if (currentUser.role !== "admin") notFound();

  const db = await getDb();
  const [prices, settingsRows, savedKeys] = await Promise.all([
    db.select().from(pricing).orderBy(asc(pricing.provider), asc(pricing.model)),
    db.select().from(appSettings),
    listApiKeys("fal"),
  ]);
  const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));
  const textModels = Array.from(
    new Set(prices.filter((price) => price.provider === "anthropic").map((price) => price.model))
  );

  return (
    <>
      <ApiKeysCard keys={savedKeys} />
      <ModelSelectionCard textModels={textModels} settings={settings} />
    </>
  );
}

function ApiKeysCard({ keys }: { keys: SavedApiKey[] }) {
  return (
    <Section
      title="API keys"
      description="Credentials for image generation. Stored encrypted; the full value is never shown again. Anthropic is configured in the server environment."
    >
      <div className="space-y-4">
        {keys.length > 0 && (
          <Plate className="divide-y divide-line py-1">
            {keys.map((key) => (
              <div key={key.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{key.label}</span>
                  <code className="mt-0.5 block text-xs text-ink-3">{key.masked}</code>
                </div>
                <DeleteConfirm
                  action={deleteApiKeyAction}
                  fields={{ id: key.id }}
                  title={`Delete “${key.label}”?`}
                  description="This key will no longer be available for image generation."
                />
              </div>
            ))}
          </Plate>
        )}
        {/* One provider exists, so there is no provider choice to make — the
            field names it instead of asking. */}
        <Plate>
        <form action={saveApiKeyAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
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
          <Button type="submit" variant="outline">
            <Plus data-icon="inline-start" /> Save key
          </Button>
        </form>
        </Plate>
      </div>
    </Section>
  );
}

function DeleteConfirm({
  action,
  fields,
  title,
  description,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  title: string;
  description: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={title}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action}>
          {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="submit" variant="destructive">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
