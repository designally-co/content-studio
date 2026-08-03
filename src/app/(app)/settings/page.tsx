import { asc } from "drizzle-orm";
import { KeyRound, LogOut, Plus, Trash2 } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { getDb } from "@/db";
import { categories, pricing, appSettings, users, type FormatRules } from "@/db/schema";
import {
  listApiKeys,
  type SavedApiKey,
} from "@/lib/secrets";
import {
  addCategoryAction,
  toggleCategoryAction,
  deleteCategoryAction,
  saveArticleTemplateAction,
  saveApiKeyAction,
  deleteApiKeyAction,
} from "./actions";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getBrand } from "@/lib/brand";
import { BrandEditor } from "./brand-editor";
import { ModelSelectionCard } from "./model-selection-card";
import { articlePrompt, getArticleRules } from "@/lib/article-template";
import { requireUser } from "@/lib/session";
import { TeamMembersCard } from "./team-members-card";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = await getDb();
  const currentUser = await requireUser();
  const [brandRow, cats, articleTemplate, prices, settingsRows, savedKeys, teamMembers] = await Promise.all([
    getBrand(),
    db.select().from(categories).orderBy(asc(categories.name)),
    getArticleRules(),
    db.select().from(pricing).orderBy(asc(pricing.provider), asc(pricing.model)),
    db.select().from(appSettings),
    listApiKeys("fal"),
    db.select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active }).from(users).orderBy(asc(users.name)),
  ]);
  // Don't ship image bytes to the client; expose one logo flag and load it
  // through /api/brand-logo.
  const {
    profileImageUrl,
    profileImageData,
    profileImageMime,
    logoData,
    logoMime,
    ...brandCols
  } = brandRow;
  void profileImageUrl;
  void profileImageMime;
  void logoMime;
  const brand = {
    ...brandCols,
    hasLogo: logoData !== "" || profileImageData !== "",
  };
  const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));
  const textModels = Array.from(
    new Set(prices.filter((price) => price.provider === "anthropic").map((price) => price.model))
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-(--z-sticky) border-b border-line bg-bg">
        <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-5 lg:px-12 xl:px-16">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-[length:var(--text-h1)] font-bold">Settings</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-3 sm:text-base">
              Manage credentials, content structure, generation models, and your account.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Tabs defaultValue="brand" className="gap-6">
          <TabsList className="grid !h-auto w-full grid-cols-2 gap-1 sm:w-fit sm:grid-cols-4">
            <TabsTrigger value="brand">Brand</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="api-models">API & models</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>

          <TabsContent value="brand">
            <BrandEditor brand={brand} />
          </TabsContent>

          <TabsContent value="content" className="space-y-6">
            <CategoriesCard categoriesList={cats} />
            <ArticleTemplateCard template={articleTemplate} />
          </TabsContent>

          <TabsContent value="api-models" className="space-y-6">
            <ApiKeysCard keys={savedKeys} />
            <ModelSelectionCard textModels={textModels} settings={settings} />
          </TabsContent>

          <TabsContent value="account" className="space-y-6">
            {currentUser.role === "admin" && <TeamMembersCard members={teamMembers} currentUserId={currentUser.id} />}
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>Manage your current Designally Content Studio session.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={logoutAction}>
                  <Button type="submit" variant="outline"><LogOut /> Sign out</Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ApiKeysCard({ keys }: { keys: SavedApiKey[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <KeyRound className="size-4" />
          </div>
          <div>
            <CardTitle>API keys</CardTitle>
            <CardDescription>
              Add provider credentials for image generation. Anthropic is configured separately in the server environment.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Keys are encrypted before storage and their full value is never shown again.
        </p>
        {keys.length > 0 && (
          <div className="divide-y divide-border rounded-lg bg-muted/60 px-3">
            {keys.map((key) => (
              <div key={key.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{key.label}</span>
                  <code className="mt-0.5 block text-xs text-muted-foreground">{key.masked}</code>
                </div>
                <DeleteConfirm
                  action={deleteApiKeyAction}
                  fields={{ id: key.id }}
                  title={`Delete “${key.label}”?`}
                  description="This key will no longer be available for image generation."
                />
              </div>
            ))}
          </div>
        )}
        <form action={saveApiKeyAction} className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="api-key-provider">Provider</Label>
            <Select name="provider" defaultValue="fal">
              <SelectTrigger id="api-key-provider" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fal">Fal.ai</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="api-key-value">API key</Label>
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
      </CardContent>
    </Card>
  );
}

type CategoryRow = typeof categories.$inferSelect;

function CategoriesCard({ categoriesList }: { categoriesList: CategoryRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <CardDescription>Organize the library and guide topic suggestions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="overflow-hidden rounded-lg border">
          {categoriesList.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No categories yet.</p>
          )}
          {categoriesList.map((category, index) => (
            <div key={category.id}>
              {index > 0 && <Separator />}
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{category.name}</span>
                  {category.nameTh && <span className="ml-2 text-sm text-muted-foreground">{category.nameTh}</span>}
                  {!category.active && <Badge variant="outline" className="ml-2">Inactive</Badge>}
                </div>
                <form action={toggleCategoryAction}>
                  <input type="hidden" name="id" value={category.id} />
                  <input type="hidden" name="active" value={String(category.active)} />
                  <Button type="submit" variant="outline" size="sm">
                    {category.active ? "Deactivate" : "Activate"}
                  </Button>
                </form>
                <DeleteConfirm
                  action={deleteCategoryAction}
                  fields={{ id: category.id }}
                  title={`Delete “${category.name}”?`}
                  description="This category will be permanently removed."
                />
              </div>
            </div>
          ))}
        </div>
        <Separator />
        <form action={addCategoryAction} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="category-name">Name</Label>
            <Input id="category-name" name="name" required placeholder="e.g. Branding" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category-name-th">Thai name <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="category-name-th" name="nameTh" placeholder="เช่น การสร้างแบรนด์" />
          </div>
          <Button type="submit" variant="outline"><Plus data-icon="inline-start" /> Add category</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ArticleTemplateCard({ template }: { template: FormatRules }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Article template</CardTitle>
        <CardDescription>
          Set the instructions the model should follow whenever it creates an article.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={saveArticleTemplateAction} className="grid gap-4">
          <FormField id="article-template-length" label="Target word count">
            <Input
              id="article-template-length"
              name="length"
              required
              defaultValue={template.length}
              placeholder="900–1,200 words"
            />
          </FormField>
          <FormField id="article-template-prompt" label="Prompt">
            <Textarea
              id="article-template-prompt"
              name="prompt"
              required
              defaultValue={articlePrompt(template)}
              className="min-h-48"
              placeholder="Describe the article structure, length, tone, headings, and any rules the model should follow…"
            />
          </FormField>
          <div>
            <Button type="submit">Save template</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


function FormField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
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
