/**
 * Voice/model provider registry for the agent builder — a mock catalog mirroring
 * the agentic platform's voice configuration surface. Nothing here hits a real
 * provider; it supplies the provider → model → voice option trees the builder's
 * Select controls render, plus small resolvers so saved handles can be shown as
 * friendly labels.
 *
 * Two pipeline architectures are supported (see {@link AgentVoiceConfig}):
 *   - "cascade": VAD → STT → LLM → TTS (classic, more knobs)
 *   - "s2r":     Speech-to-Reasoning → TTS (fused, recommended)
 */

export type ModelOption = { handle: string; label: string; note?: string };
export type ProviderOption = {
  handle: string;
  label: string;
  /** Marketing-ish note shown under the provider name. */
  note?: string;
  models: ModelOption[];
};

/** A TTS provider additionally carries a voice list per provider. */
export type VoiceOption = { handle: string; label: string; note?: string };
export type TtsProviderOption = ProviderOption & { voices: VoiceOption[] };

/* --------------------------------------------------------- */
/* Speech-to-Text (cascade architecture)                     */
/* --------------------------------------------------------- */

export const STT_PROVIDERS: ProviderOption[] = [
  {
    handle: "sarvam",
    label: "Sarvam AI",
    note: "Strong Indic-language ASR",
    models: [
      { handle: "saarika-v2", label: "Saarika v2", note: "11 Indian languages" },
      { handle: "saarika-v1", label: "Saarika v1" },
    ],
  },
  {
    handle: "deepgram",
    label: "Deepgram",
    note: "Low-latency streaming ASR",
    models: [
      { handle: "nova-2", label: "Nova-2", note: "Best accuracy" },
      { handle: "nova-2-phonecall", label: "Nova-2 Phonecall", note: "Tuned for telephony" },
    ],
  },
  {
    handle: "google",
    label: "Google Cloud STT",
    models: [
      { handle: "chirp-2", label: "Chirp 2" },
      { handle: "telephony", label: "Telephony" },
    ],
  },
];

/* --------------------------------------------------------- */
/* Reasoning LLM (cascade architecture)                      */
/* --------------------------------------------------------- */

export const LLM_PROVIDERS: ProviderOption[] = [
  {
    handle: "openai",
    label: "OpenAI",
    models: [
      { handle: "gpt-4o", label: "GPT-4o", note: "Fast, multimodal" },
      { handle: "gpt-4o-mini", label: "GPT-4o mini", note: "Cheapest, lowest latency" },
    ],
  },
  {
    handle: "anthropic",
    label: "Anthropic",
    models: [
      { handle: "claude-sonnet", label: "Claude Sonnet", note: "Balanced reasoning" },
      { handle: "claude-haiku", label: "Claude Haiku", note: "Lowest latency" },
    ],
  },
  {
    handle: "google",
    label: "Google",
    models: [
      { handle: "gemini-flash", label: "Gemini 2.0 Flash" },
      { handle: "gemini-pro", label: "Gemini 2.0 Pro" },
    ],
  },
];

/* --------------------------------------------------------- */
/* Speech-to-Reasoning (fused; recommended architecture)     */
/* --------------------------------------------------------- */

export const S2R_PROVIDERS: ProviderOption[] = [
  {
    handle: "sarvam",
    label: "Sarvam AI",
    note: "Indic-first fused S2R",
    models: [
      { handle: "bulbul-reason-v1", label: "Bulbul Reason v1", note: "Indic voice-to-reasoning" },
    ],
  },
  {
    handle: "openai",
    label: "OpenAI Realtime",
    note: "Fused speech + reasoning",
    models: [
      { handle: "gpt-4o-realtime", label: "GPT-4o Realtime", note: "Native speech-to-speech" },
      { handle: "gpt-4o-mini-realtime", label: "GPT-4o mini Realtime" },
    ],
  },
  {
    handle: "google",
    label: "Google Gemini Live",
    models: [
      { handle: "gemini-live-flash", label: "Gemini Live Flash" },
    ],
  },
];

/* --------------------------------------------------------- */
/* Text-to-Speech (both architectures)                       */
/* --------------------------------------------------------- */

export const TTS_PROVIDERS: TtsProviderOption[] = [
  {
    handle: "paytm-svara",
    label: "Paytm Svara",
    note: "In-house Indic TTS",
    models: [{ handle: "svara-tts-1", label: "Svara TTS v1" }],
    voices: [
      { handle: "svara-priya", label: "Priya", note: "Female · warm · Hinglish" },
      { handle: "svara-arjun", label: "Arjun", note: "Male · calm · Hinglish" },
      { handle: "svara-meera", label: "Meera", note: "Female · crisp · Hindi" },
    ],
  },
  {
    handle: "elevenlabs",
    label: "ElevenLabs",
    note: "Premium expressive voices",
    models: [
      { handle: "eleven-multilingual-v2", label: "Multilingual v2" },
      { handle: "eleven-turbo-v2", label: "Turbo v2", note: "Lowest latency" },
    ],
    voices: [
      { handle: "adam", label: "Adam", note: "Male · deep" },
      { handle: "rachel", label: "Rachel", note: "Female · natural" },
      { handle: "charlie", label: "Charlie", note: "Male · casual" },
    ],
  },
  {
    handle: "sarvam",
    label: "Sarvam AI",
    note: "Indic-language TTS",
    models: [{ handle: "bulbul-v2", label: "Bulbul v2" }],
    voices: [
      { handle: "anushka", label: "Anushka", note: "Female · Hindi" },
      { handle: "abhilash", label: "Abhilash", note: "Male · Hindi" },
      { handle: "karun", label: "Karun", note: "Male · neutral" },
    ],
  },
  {
    handle: "smallest",
    label: "Smallest AI",
    note: "Ultra-low-latency TTS",
    models: [{ handle: "lightning", label: "Lightning" }],
    voices: [
      { handle: "emily", label: "Emily", note: "Female · clear" },
      { handle: "raj", label: "Raj", note: "Male · energetic" },
    ],
  },
];

/* --------------------------------------------------------- */
/* Defaults + resolvers                                      */
/* --------------------------------------------------------- */

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2.0;
export const DEFAULT_SPEED = 1.0;

/** The recommended starting config for a brand-new voice agent (S2R stack). */
export const DEFAULT_VOICE_CONFIG = {
  architecture: "s2r" as const,
  s2rProvider: "sarvam",
  s2rModel: "bulbul-reason-v1",
  ttsProvider: "paytm-svara",
  ttsModel: "svara-tts-1",
  ttsVoice: "svara-priya",
  speed: DEFAULT_SPEED,
};

export const LANGUAGES = [
  "English",
  "Hindi",
  "Hinglish",
  "Tamil",
  "Telugu",
  "Kannada",
  "Marathi",
  "Bengali",
  "Gujarati",
] as const;

function findProvider(list: ProviderOption[], handle?: string) {
  return list.find((p) => p.handle === handle);
}

export function providerLabel(list: ProviderOption[], handle?: string): string {
  return findProvider(list, handle)?.label ?? handle ?? "—";
}

export function modelsFor(list: ProviderOption[], providerHandle?: string): ModelOption[] {
  return findProvider(list, providerHandle)?.models ?? [];
}

export function modelLabel(list: ProviderOption[], providerHandle?: string, modelHandle?: string): string {
  return modelsFor(list, providerHandle).find((m) => m.handle === modelHandle)?.label ?? modelHandle ?? "—";
}

export function voicesFor(providerHandle?: string): VoiceOption[] {
  return TTS_PROVIDERS.find((p) => p.handle === providerHandle)?.voices ?? [];
}

export function voiceLabel(providerHandle?: string, voiceHandle?: string): string {
  return voicesFor(providerHandle).find((v) => v.handle === voiceHandle)?.label ?? voiceHandle ?? "—";
}
