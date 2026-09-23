/**
 * Shared model configuration store.
 *
 * The Agent Builder keeps the LLM choice (Claude model + key + sampling) OUT of
 * the agent itself: several agents point at the same config, and an agent's
 * prompt/tools shouldn't have to carry a key. So a config is its own thing, held
 * once here and referenced by `AgentRecord.modelConfigId`. The Model node in the
 * builder reads/writes these.
 *
 * Module-level store + `useSyncExternalStore`, matching `template-store` and
 * `connections`. In-memory only — a hard refresh replays the demo from seed.
 *
 * Security: this is a UX prototype. The `apiKey` never leaves memory, is never
 * persisted, is masked to its last 4 characters in the UI, and drives no real
 * network calls.
 */
import { useSyncExternalStore } from "react";

export type ModelConfig = {
  id: string;
  name: string;
  provider: "anthropic";
  /** Anthropic model id, e.g. "claude-opus-4-6". */
  model: string;
  /** Secret key — masked in the UI, never persisted. */
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
};

/** A few current Claude models to pick from in the Model node. */
export const CLAUDE_MODELS: { id: string; label: string }[] = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-6", label: "Claude Haiku 4.6" },
];

const SEED_MODEL_CONFIGS: ModelConfig[] = [
  {
    id: "mc_default",
    name: "Claude Opus — Production",
    provider: "anthropic",
    model: "claude-opus-4-6",
    apiKey: "sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx7f4a",
    temperature: 0.4,
    maxTokens: 1024,
  },
  {
    id: "mc_fast",
    name: "Claude Haiku — Low latency",
    provider: "anthropic",
    model: "claude-haiku-4-6",
    apiKey: "sk-ant-api03-yyyyyyyyyyyyyyyyyyyyyyyy91c2",
    temperature: 0.2,
    maxTokens: 512,
  },
];

let current: ModelConfig[] = SEED_MODEL_CONFIGS;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive read of every model config. */
export function useModelConfigs(): ModelConfig[] {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

/** Reactive read of one config by id. */
export function useModelConfig(id?: string): ModelConfig | undefined {
  const all = useModelConfigs();
  return id ? all.find((c) => c.id === id) : undefined;
}

/** Imperative read — for non-React callers. */
export function getModelConfigs(): ModelConfig[] {
  return current;
}

export function getModelConfig(id?: string): ModelConfig | undefined {
  return id ? current.find((c) => c.id === id) : undefined;
}

/** Upsert by id. New configs go to the front. */
export function saveModelConfig(c: ModelConfig) {
  const i = current.findIndex((x) => x.id === c.id);
  current = i === -1 ? [c, ...current] : current.map((x) => (x.id === c.id ? c : x));
  emit();
}

export function removeModelConfig(id: string) {
  current = current.filter((c) => c.id !== id);
  emit();
}

/** Mask a key to its last 4 characters for display, e.g. "••••7f4a". */
export function maskKey(key: string): string {
  const tail = key.slice(-4);
  return `${"•".repeat(8)}${tail}`;
}
