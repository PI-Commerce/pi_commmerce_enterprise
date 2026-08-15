/**
 * AI ad-creative generation — deliberately one function, deliberately thin.
 *
 * This is a fast-follower capability, not the differentiator, so it is mocked at
 * exactly the seam a real model would occupy: prompt in, ranked variants out.
 * The body composes from an angle bank rather than pretending to be clever.
 *
 * BACKEND: replace the body with a single LLM call. The signature, the async
 * shape and {@link CreativeVariant} stay as they are, so no caller changes.
 */
import type { AdFormat } from "@/lib/ctwa-types";

export type CreativeVariant = {
  id: string;
  /** The persuasion angle this variant plays, shown as a chip so the choice is legible. */
  angle: string;
  headline: string;
  caption: string;
  mediaUrl: string;
  format: AdFormat;
};

/** Optional brand assets a merchant has on file. Only names are used by the mock. */
export type CreativeAssets = {
  brandName?: string;
  offer?: string;
};

const ANGLES: {
  name: string;
  headline: (subject: string, offer: string) => string;
  caption: (subject: string, offer: string, brand: string) => string;
  format: AdFormat;
}[] = [
  {
    name: "Speed",
    headline: (s) => `${s} in under 30 minutes`,
    caption: (s, o, b) =>
      `Get ${s.toLowerCase()} without the paperwork. ${o} Chat with ${b} on WhatsApp and we'll walk you through it in minutes.`,
    format: "image",
  },
  {
    name: "Low barrier",
    headline: (_s, o) => (o ? o : "Start with what you have"),
    caption: (s, o, b) =>
      `No income proof, no branch visit, no waiting. ${o} Message ${b} on WhatsApp to check what you qualify for — ${s.toLowerCase()} made simple.`,
    format: "image",
  },
  {
    name: "Guidance",
    headline: (s) => `Talk to a ${s.toLowerCase()} advisor`,
    caption: (s, o, b) =>
      `Not sure where to start? A ${b} specialist will compare your options for ${s.toLowerCase()} on WhatsApp — no jargon, no obligation. ${o}`.trim(),
    format: "video",
  },
  {
    name: "Social proof",
    headline: (s) => `Why 2 lakh chose us for ${s.toLowerCase()}`,
    caption: (s, o, b) =>
      `Thousands of customers set up ${s.toLowerCase()} with ${b} last month. ${o} Tap to start the same conversation on WhatsApp.`,
    format: "carousel",
  },
];

let callCount = 0;

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28) || "creative";
}

/**
 * Produce ad-copy variants for a plain-language brief.
 *
 * Async and slightly slow on purpose — every caller has to handle the pending
 * state now rather than discovering it when a real model is wired in.
 */
export async function generateCreatives(
  prompt: string,
  assets: CreativeAssets = {},
): Promise<CreativeVariant[]> {
  await new Promise((r) => setTimeout(r, 900));

  const subject = prompt.trim() || "your offer";
  const brand = assets.brandName?.trim() || "us";
  const offer = assets.offer?.trim() ? `${assets.offer.trim()}.` : "";
  const run = ++callCount;
  const base = slugify(subject);

  // Rotate the angle order per run so "Regenerate" visibly reshuffles priority.
  return ANGLES.map((_, i) => ANGLES[(i + run) % ANGLES.length]).map((a, i) => ({
    id: `cr_${run}_${i}`,
    angle: a.name,
    headline: a.headline(subject, offer.replace(/\.$/, "")),
    caption: a.caption(subject, offer, brand).replace(/\s+/g, " ").trim(),
    mediaUrl: `picom://creative/${base}-${a.name.toLowerCase().replace(/\s+/g, "-")}`,
    format: a.format,
  }));
}
