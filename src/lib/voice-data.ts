/**
 * Voice, language and phone-number seed data for the agent builder Settings
 * section. Mock data: the voice picker, TTS-provider tabs and number selection
 * are UI-only (no live backend).
 */

export type TtsProvider = "azure" | "cartesia" | "elevenlabs" | "google" | "sarvam";

export type Voice = {
  id: string;
  name: string;
  provider: TtsProvider;
  /** Tone descriptor shown on the card (e.g. Neutral, Warm, Energetic). */
  tone: string;
  /** Optional highlight badge, e.g. "Most Used". */
  badge?: string;
  /** BCP-47-ish language codes this voice supports. */
  langs: string[];
};

export type Language = { code: string; label: string };

export const PROVIDER_LABELS: Record<TtsProvider, string> = {
  azure: "Azure",
  cartesia: "Cartesia",
  elevenlabs: "ElevenLabs",
  google: "Google",
  sarvam: "Sarvam",
};

/** Tab order on the voice picker ("All" is prepended in the component). */
export const TTS_PROVIDERS: TtsProvider[] = ["azure", "cartesia", "elevenlabs", "google", "sarvam"];

export const LANGUAGES: Language[] = [
  { code: "en-IN", label: "English (IN)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "kn-IN", label: "Kannada" },
  { code: "mr-IN", label: "Marathi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "en-US", label: "English (US)" },
];

export const VOICES: Voice[] = [
  { id: "sarvam_riya",   name: "Riya (Sonic-3.5)", provider: "sarvam",     tone: "Neutral",   badge: "Most Used", langs: ["en-IN", "hi-IN", "ta-IN", "te-IN"] },
  { id: "sarvam_tiya",   name: "Tiya",             provider: "sarvam",     tone: "Neutral",   langs: ["en-IN", "hi-IN"] },
  { id: "sarvam_kashish",name: "Kashish",          provider: "sarvam",     tone: "Neutral",   langs: ["en-IN", "hi-IN", "mr-IN"] },
  { id: "sarvam_jai",    name: "Jai",              provider: "sarvam",     tone: "Neutral",   langs: ["en-IN", "hi-IN"] },
  { id: "sarvam_ankita", name: "Ankita",           provider: "sarvam",     tone: "Neutral",   langs: ["en-IN", "hi-IN", "bn-IN"] },
  { id: "sarvam_richa",  name: "Richa",            provider: "sarvam",     tone: "Neutral",   langs: ["en-IN", "hi-IN", "gu-IN"] },
  { id: "11_rachel",     name: "Rachel",           provider: "elevenlabs", tone: "Warm",      langs: ["en-US", "en-IN"] },
  { id: "11_adam",       name: "Adam",             provider: "elevenlabs", tone: "Deep",      langs: ["en-US", "en-IN"] },
  { id: "cartesia_sonic",name: "Sonic",            provider: "cartesia",   tone: "Energetic", langs: ["en-US", "en-IN"] },
  { id: "cartesia_lumen",name: "Lumen",            provider: "cartesia",   tone: "Calm",      langs: ["en-US", "en-IN"] },
  { id: "azure_neerja",  name: "Neerja",           provider: "azure",      tone: "Neutral",   langs: ["en-IN", "hi-IN"] },
  { id: "azure_prabhat", name: "Prabhat",          provider: "azure",      tone: "Neutral",   langs: ["en-IN", "hi-IN"] },
  { id: "google_wavenet_a", name: "Wavenet A",     provider: "google",     tone: "Neutral",   langs: ["en-IN", "en-US"] },
  { id: "google_wavenet_c", name: "Wavenet C",     provider: "google",     tone: "Bright",    langs: ["en-IN", "en-US"] },
];

export function getVoice(id?: string): Voice | undefined {
  return id ? VOICES.find((v) => v.id === id) : undefined;
}

/** Voices available for a given primary language (falls back to all). */
export function voicesForLang(lang?: string): Voice[] {
  if (!lang) return VOICES;
  const matched = VOICES.filter((v) => v.langs.includes(lang));
  return matched.length ? matched : VOICES;
}

export type PhoneNumber = {
  id: string;
  e164: string;
  label: string;
  /** A test/sandbox number vs a provisioned production number. */
  test?: boolean;
};

export const PHONE_NUMBERS: PhoneNumber[] = [
  { id: "pn_test_blr", e164: "+91 80 3170 5928", label: "Bengaluru test line", test: true },
  { id: "pn_mum",      e164: "+91 22 6140 2200", label: "Mumbai outbound" },
  { id: "pn_del",      e164: "+91 11 4100 8800", label: "Delhi outbound" },
  { id: "pn_us",       e164: "+1 415 555 0132",  label: "US (San Francisco)" },
];

export function getPhoneNumber(id?: string): PhoneNumber | undefined {
  return id ? PHONE_NUMBERS.find((p) => p.id === id) : undefined;
}
