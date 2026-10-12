// Ask Pi — the landing chat "brain" (prototype).
//
// The Ask Pi landing page is a ChatGPT/Claude-style conversation that turns a
// plain-language request into a *drafted* campaign or agent, then deep-links the
// user into the real builder to review and launch. This module owns the mock
// intelligence: it classifies what the user asked for and returns a scripted
// assistant turn — friendly copy, a short "thinking" trace, an optional artifact
// card, and follow-up suggestions. No backend wording ever leaks into the UI;
// to the end user it just feels like Pi drafting something for them.

export type AgentKind = "chat" | "voice";

export type CampaignNodeKind =
  | "audience"
  | "aiTransform"
  | "whatsapp"
  | "sms"
  | "delay"
  | "conditional"
  | "voiceCall"
  | "aiChat"
  | "end";

export type CampaignStep = { label: string; node: CampaignNodeKind; detail?: string };

export type CampaignArtifact = {
  kind: "campaign";
  name: string;
  objective: string;
  audience: string;
  channels: string[];
  steps: CampaignStep[];
  /** Deep-link payload for the journey builder (/journeys/$id · id:"new"). */
  nav: { name: string; description: string; objective: string };
};

export type AgentArtifact = {
  kind: "agent";
  name: string;
  type: AgentKind;
  model: string;
  channel: string;
  tools: string[];
  guardrails: string[];
  /** Deep-link payload for the agent builder (/agents/new). */
  nav: { type: AgentKind };
};

export type Artifact = CampaignArtifact | AgentArtifact;

/** The content of one assistant reply. */
export type AssistantTurn = {
  text: string;
  /** Short, friendly steps shown while Pi is "drafting". */
  thinking: string[];
  artifact?: Artifact;
  /** One-tap suggestions shown under the reply. */
  followups?: string[];
};

export type ChatTurn =
  | { id: string; role: "user"; text: string }
  | ({ id: string; role: "assistant" } & AssistantTurn);

/** A saved conversation (a "thread") shown in the Chats rail. */
export type Chat = {
  id: string;
  title: string;
  turns: ChatTurn[];
  /** Last-activity timestamp (ms) — drives ordering and the relative label. */
  updatedAt: number;
};

/** Short, readable thread title derived from the first user message. */
export function titleFromPrompt(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= 44) return t;
  return `${t.slice(0, 44).replace(/\s+\S*$/, "")}…`;
}

/** "just now" / "3 hours ago" / "4 days ago" style relative label. */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min > 1 ? "s" : ""} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr > 1 ? "s" : ""} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day > 1 ? "s" : ""} ago`;
  const mo = Math.floor(day / 30);
  return `${mo} month${mo > 1 ? "s" : ""} ago`;
}

/** A few realistic past threads so the Chats rail isn't empty on first visit. */
export function buildSeedChats(now: number = Date.now()): Chat[] {
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const mk = (sid: string, title: string, prompt: string, age: number): Chat => {
    const reply = respondToPi(prompt);
    return {
      id: `seed_${sid}`,
      title,
      updatedAt: now - age,
      turns: [
        { id: `seed_${sid}_u`, role: "user", text: prompt },
        { id: `seed_${sid}_a`, role: "assistant", ...reply },
      ],
    };
  };
  return [
    mk("winback", "Win-back journey for dormant traders", "Build a win-back journey for dormant traders on WhatsApp with a voice follow-up", 2 * HOUR),
    mk("kyc", "WhatsApp KYC chat agent", "Create a WhatsApp chat agent that helps customers finish KYC", 1 * DAY + 4 * HOUR),
    mk("voice", "Win-back voice agent", "Draft a win-back voice agent for high-value traders", 2 * DAY),
    mk("perf", "This week's performance", "How are my journeys doing this week?", 5 * DAY),
  ];
}

// ---- Hero starters ------------------------------------------------------

export type StarterKind = "campaign" | "agent" | "analytics";

export type Starter = {
  kind: StarterKind;
  title: string;
  example: string;
  /** The prompt that gets sent when the card is tapped. */
  prompt: string;
};

export const PI_STARTERS: Starter[] = [
  {
    kind: "campaign",
    title: "Build a journey",
    example: "Win back dormant traders on WhatsApp, with a voice follow-up.",
    prompt: "Build a win-back journey for dormant traders on WhatsApp with a voice follow-up",
  },
  {
    kind: "agent",
    title: "Create a chat agent",
    example: "A WhatsApp assistant that helps customers finish KYC.",
    prompt: "Create a WhatsApp chat agent that helps customers finish KYC",
  },
  {
    kind: "agent",
    title: "Draft a voice agent",
    example: "A warm win-back caller for high-value traders.",
    prompt: "Draft a win-back voice agent for high-value traders",
  },
  {
    kind: "analytics",
    title: "Check performance",
    example: "How are my journeys doing this week?",
    prompt: "How are my journeys doing this week?",
  },
];

/** Quick proactive invites shown in the hero (user's own phrasing style). */
export const PI_INVITES: string[] = [
  "Want a win-back voice agent drafted?",
  "Reactivate dormant traders on WhatsApp?",
  "Build a KYC drop-off recovery journey?",
];

// ---- Intent routing -----------------------------------------------------

const has = (q: string, re: RegExp) => re.test(q);

function buildCampaign(q: string): AssistantTurn {
  // Pick a flavor from the request; default to win-back/reactivation.
  const onboarding = has(q, /onboard|new trader|activation|first deposit|sign.?up/);
  const kyc = has(q, /kyc|drop.?off|verif/);
  const addVoice = has(q, /voice|call/);
  const addSms = has(q, /sms|text message/);

  let name = "Dormant Trader Win-back";
  let objective = "Reactivate traders with no trade in the last 30 days";
  let audience = "~4,200 dormant traders · no trade · 30d";
  let opener = "a win-back journey for dormant traders";

  if (onboarding) {
    name = "New Trader Onboarding";
    objective = "Activate new traders who haven't made a first deposit in 48h";
    audience = "~1,900 new traders · no first deposit · 48h";
    opener = "an onboarding journey for new traders";
  } else if (kyc) {
    name = "KYC Drop-off Recovery";
    objective = "Bring back users who abandoned KYC before completion";
    audience = "~3,100 users · KYC started, not completed";
    opener = "a KYC drop-off recovery journey";
  }

  const channels = ["WhatsApp"];
  const steps: CampaignStep[] = [
    { label: "Audience", node: "audience", detail: audience },
    { label: "Personalize copy", node: "aiTransform" },
    { label: "WhatsApp", node: "whatsapp", detail: kyc ? "kyc_reminder" : onboarding ? "welcome_offer" : "winback_v2" },
    { label: "Wait 24h", node: "delay" },
    { label: "Replied?", node: "conditional" },
  ];
  if (addSms) {
    channels.push("SMS");
    steps.push({ label: "SMS fallback", node: "sms", detail: "non-responders" });
  }
  // Win-back and onboarding default to a voice follow-up; KYC stays messaging-only unless asked.
  if (addVoice || (!kyc && !addSms)) {
    channels.push("Voice");
    steps.push({ label: "Voice AI", node: "voiceCall", detail: "non-responders" });
  }
  steps.push({ label: "End", node: "end" });

  const channelLine =
    channels.length > 1
      ? `${channels.slice(0, -1).join(", ")} with a ${channels[channels.length - 1].toLowerCase()} follow-up for non-responders`
      : "WhatsApp";

  return {
    text: `Here's ${opener}. It opens on ${channelLine}, waits a day, then branches on whether they replied. Open it in the builder to fine-tune the audience, copy, and timing before you launch.`,
    thinking: [
      "Understanding your goal and audience…",
      "Mapping the journey…",
      "Choosing channels and timing…",
      "Putting the draft together…",
    ],
    artifact: {
      kind: "campaign",
      name,
      objective,
      audience,
      channels,
      steps,
      nav: {
        name,
        description: `${objective}. Drafted by Pi: ${steps.map((s) => s.label).join(" → ")}.`,
        objective: kyc ? "kyc_recovery" : onboarding ? "onboarding" : "reactivation",
      },
    },
    followups: addVoice
      ? ["Add an SMS fallback", "Make it a 3-step journey", "Use a 60-day dormant audience"]
      : ["Add a voice follow-up", "Add an SMS fallback", "Make it a 3-step journey"],
  };
}

function buildAgent(q: string): AssistantTurn {
  const voice = has(q, /voice|call|caller|ivr|phone/);
  const kyc = has(q, /kyc|verif|drop.?off/);
  const support = has(q, /support|help ?desk|l1|ticket|issue/);
  const winback = has(q, /win.?back|reactivat|dormant/);

  if (voice) {
    const name = winback ? "Win-back Voice" : "Voice Concierge";
    return {
      text: `${winback ? "Want a win-back voice agent drafted? Done." : "Here's a voice agent to get you started."} It calls with a warm, concise tone, looks up the customer's recent activity before it speaks, and never offers a discount beyond your cap. Open it in the agent builder to hear it and adjust the script.`,
      thinking: [
        "Understanding what the agent should do…",
        "Picking the right tools…",
        "Writing the script and guardrails…",
        "Putting the draft together…",
      ],
      artifact: {
        kind: "agent",
        name,
        type: "voice",
        model: "Pi Voice",
        channel: "Outbound calls",
        tools: ["place_call", "order_lookup", "schedule_callback"],
        guardrails: ["No discounts above 15%", "Barge-in enabled", "Hand off to a human on request"],
        nav: { type: "voice" },
      },
      followups: ["Make it a chat agent instead", "Raise the discount cap to 20%", "Add a callback booking tool"],
    };
  }

  // Chat agent flavors.
  let name = "Pi Concierge";
  let purpose = "answers common customer questions on WhatsApp";
  let tools = ["knowledge_lookup", "order_lookup", "send_whatsapp"];
  let guardrails = ["No investment advice", "Escalate failed payments over ₹10,000"];

  if (kyc) {
    name = "KYC Helper";
    purpose = "walks customers through finishing KYC on WhatsApp";
    tools = ["kyc_status_lookup", "knowledge_lookup", "send_whatsapp"];
    guardrails = ["No investment advice", "Escalate stuck verifications to a human"];
  } else if (support) {
    name = "L1 Support";
    purpose = "handles first-line support and resolves or routes each request";
    tools = ["ticket_lookup", "knowledge_lookup", "create_ticket", "send_whatsapp"];
    guardrails = ["Never share internal notes", "Escalate anything about money to a human"];
  }

  return {
    text: `I've drafted a WhatsApp chat agent that ${purpose}. It can pull the right info before answering and knows when to hand off to a person. Open it in the agent builder to review the prompt and tools.`,
    thinking: [
      "Understanding what the agent should do…",
      "Picking the right tools…",
      "Writing the prompt and guardrails…",
      "Putting the draft together…",
    ],
    artifact: {
      kind: "agent",
      name,
      type: "chat",
      model: "Pi Chat",
      channel: "WhatsApp",
      tools,
      guardrails,
      nav: { type: "chat" },
    },
    followups: ["Make it a voice agent instead", "Add a refund lookup tool", "Tighten the guardrails"],
  };
}

function buildAnalytics(): AssistantTurn {
  return {
    text: "Here's the shape of your last 7 days: reactivation is your biggest mover — conversions up 6% week over week — while KYC Drop-off Recovery slipped 8% after Jun 7. Voice is out-converting WhatsApp by about 11 points on win-back. Want me to dig into any of these?",
    thinking: ["Reading the last 7 days…", "Comparing journeys and channels…", "Pulling out what moved…"],
    followups: ["Why did KYC drop 8%?", "Build a KYC recovery journey", "Draft a win-back voice agent"],
  };
}

function buildGreeting(): AssistantTurn {
  return {
    text: 'I can draft a journey or an agent for you and open it in the builder, ready to launch. Tell me the goal — for example, "win back dormant traders on WhatsApp" or "a voice agent that handles refund requests" — and I\'ll take it from there.',
    thinking: ["Reading your workspace…", "Figuring out the best next step…"],
    followups: ["Build a win-back journey", "Create a KYC chat agent", "How are my journeys doing?"],
  };
}

/**
 * Classify a free-text request and return Pi's scripted reply.
 * Priority: an explicit "agent" wins unless the request is clearly about a
 * campaign/journey; then campaign; then analytics; else a friendly greeting.
 */
export function respondToPi(query: string): AssistantTurn {
  const q = query.toLowerCase().trim();
  if (!q) return buildGreeting();

  const mentionsCampaign = has(q, /campaign|journey|flow|blast|broadcast|nurture|sequence|drip/);
  const mentionsAgent = has(q, /\bagent\b|\bbot\b|concierge|assistant|caller|ivr|chatbot|voice ?bot/);

  if (mentionsAgent && !mentionsCampaign) return buildAgent(q);
  if (mentionsCampaign || has(q, /win.?back|reactivat|dormant|onboard|kyc|drop.?off|audience|recover/)) {
    // "a campaign with a voice agent" → the primary artifact is the campaign.
    return buildCampaign(q);
  }
  if (has(q, /why|how.*(doing|perform)|performance|analytics|chart|compare|conversion|metric|trend|best|worst|drop(ped)?|slip/)) {
    return buildAnalytics();
  }
  if (mentionsAgent) return buildAgent(q);
  return buildGreeting();
}
