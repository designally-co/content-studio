import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import type { InferSelectModel } from "drizzle-orm";
import type {
  brandProfiles,
  categories,
  Language,
  ProjectInputs,
  FormatRules,
} from "@/db/schema";
import { SYSTEM_BASE, JSON_CONTRACT } from "@/prompts/system";
import {
  buildBrandLayer,
  buildFormatLayer,
  buildContextLayer,
} from "@/prompts/layers";
import { extractJson } from "./json";
import { logUsage, type Usage } from "./cost";

type Brand = InferSelectModel<typeof brandProfiles>;
type Category = InferSelectModel<typeof categories>;

export type PipelineContext = {
  brand: Brand;
  articleRules: FormatRules;
  category: Category | null;
  language: Language;
  inputs: ProjectInputs;
};

/**
 * Builds a client per call from the server environment. Anthropic credentials
 * are intentionally not user-managed in Settings.
 */
async function anthropicClient(): Promise<Anthropic> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
  }
  return new Anthropic({ apiKey });
}

export async function isAnthropicConfigured(): Promise<boolean> {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function getModels(): Promise<{ research: string; drafting: string }> {
  const db = await getDb();
  const rows = await db.select().from(appSettings);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    research: map["model.research"] ?? "claude-haiku-4-5",
    drafting: map["model.drafting"] ?? "claude-sonnet-5",
  };
}

/**
 * Explicitly disable thinking on models that accept it so drafting streams
 * text immediately (no leading thinking pause). Omit on Haiku/older models.
 */
function thinkingParam(model: string) {
  if (/haiku|claude-3/.test(model)) return undefined;
  return { type: "disabled" as const };
}

/** Web search tool version valid across all current models (incl. Haiku). */
const WEB_SEARCH_TOOL = { type: "web_search_20250305", name: "web_search", max_uses: 5 } as const;

/** Compose the layered system prompt (system + brand + format + context). */
export function buildSystemPrompt(ctx: PipelineContext): string {
  return [
    SYSTEM_BASE,
    buildBrandLayer(ctx.brand),
    buildFormatLayer(ctx.articleRules, ctx.category, ctx.language),
    buildContextLayer(ctx.inputs),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Concatenate text blocks from a message response. */
function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/**
 * Structured (JSON) generation with defensive parsing and one retry on parse
 * failure (per spec §6.1). Logs usage under `stage`.
 */
export async function runJson<T>(params: {
  model: string;
  system: string;
  task: string;
  maxTokens: number;
  webSearch?: boolean;
  projectId: string | null;
  stage: string;
}): Promise<{ data: T; usage: Usage }> {
  const attempt = async (extra?: string) => {
    const client = await anthropicClient();
    const msg = await client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      ...(thinkingParam(params.model)
        ? { thinking: thinkingParam(params.model) }
        : {}),
      system: `${params.system}\n\n${JSON_CONTRACT}`,
      ...(params.webSearch ? { tools: [WEB_SEARCH_TOOL] } : {}),
      messages: [
        { role: "user", content: extra ? `${params.task}\n\n${extra}` : params.task },
      ],
    });
    return msg;
  };

  let msg = await attempt();
  await logUsage({
    projectId: params.projectId,
    stage: params.stage,
    model: params.model,
    usage: msg.usage,
  });
  let parsed = extractJson<T>(textOf(msg.content));

  if (parsed === null) {
    msg = await attempt(
      "Your previous reply could not be parsed as JSON. Reply again with ONLY the valid JSON object — no code fences, no prose."
    );
    await logUsage({
      projectId: params.projectId,
      stage: `${params.stage}:retry`,
      model: params.model,
      usage: msg.usage,
    });
    parsed = extractJson<T>(textOf(msg.content));
  }

  if (parsed === null) {
    throw new Error("Model did not return parseable JSON after one retry.");
  }
  return { data: parsed, usage: msg.usage };
}

/**
 * Stream a plain-text generation. Calls `onDelta` for each text chunk and
 * returns the final text plus usage (caller logs usage + persists).
 */
export async function streamText(params: {
  model: string;
  system: string;
  task: string;
  maxTokens: number;
  onDelta: (text: string) => void;
}): Promise<{ text: string; usage: Usage }> {
  const client = await anthropicClient();
  const stream = client.messages.stream({
    model: params.model,
    max_tokens: params.maxTokens,
    ...(thinkingParam(params.model)
      ? { thinking: thinkingParam(params.model) }
      : {}),
    system: params.system,
    messages: [{ role: "user", content: params.task }],
  });

  stream.on("text", (delta) => params.onDelta(delta));
  const final = await stream.finalMessage();
  return { text: textOf(final.content), usage: final.usage };
}

/** Non-streaming plain-text generation (e.g. competitor summary, image prompt). */
export async function runText(params: {
  model: string;
  system?: string;
  task: string;
  maxTokens: number;
  projectId: string | null;
  stage: string;
}): Promise<{ text: string; usage: Usage }> {
  const client = await anthropicClient();
  const msg = await client.messages.create({
    model: params.model,
    max_tokens: params.maxTokens,
    ...(thinkingParam(params.model)
      ? { thinking: thinkingParam(params.model) }
      : {}),
    ...(params.system ? { system: params.system } : {}),
    messages: [{ role: "user", content: params.task }],
  });
  await logUsage({
    projectId: params.projectId,
    stage: params.stage,
    model: params.model,
    usage: msg.usage,
  });
  return { text: textOf(msg.content), usage: msg.usage };
}
