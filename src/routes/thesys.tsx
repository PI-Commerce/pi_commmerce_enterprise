import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkle, ArrowLeft } from "lucide-react";
import { PiThesysResult } from "@/components/app/PiThesysResult";
import { THESYS_FIXTURES, type ThesysFixtureKey } from "@/lib/pi-thesys-fixtures";

export const Route = createFileRoute("/thesys")({
  component: ThesysPage,
  head: () => ({
    meta: [{ title: "Ask Pi — Thesys generative UI" }],
  }),
});

// Each question maps to one captured C1 response. The fixtures will be regenerated from
// real voice-agent data pulled from ClickHouse (see scripts/capture-thesys.mjs), so the
// keys are the stable interface — swapping mock for real data needs no UI change.
const QUESTIONS: { q: string; key: ThesysFixtureKey }[] = [
  { q: "Chart conversions by channel", key: "channel" },
  { q: "Compare this run vs last", key: "trend" },
  { q: "Compare WhatsApp vs Voice", key: "wa_vs_voice" },
  { q: "Why did reactivation drop 8%?", key: "reactivation_drop" },
];

function ThesysPage() {
  const [i, setI] = useState(0);
  const active = QUESTIONS[i];
  const fixture = THESYS_FIXTURES[active.key];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Header */}
        <div className="mb-1 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Link to="/analytics" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Analytics
          </Link>
          <span>·</span>
          <span>Thesys generative UI</span>
        </div>
        <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight">
          <Sparkle className="h-4.5 w-4.5 fill-ai text-ai" />
          Ask Pi · Thesys
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          Pi answers each question with a Thesys C1 generative-UI card. Flip the question to see
          the rendered response.
        </p>

        {/* Question switcher */}
        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          <span className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">Ask</span>
          {QUESTIONS.map((item, idx) => (
            <button
              key={item.key}
              onClick={() => setI(idx)}
              className={
                "rounded-full border px-3 py-1 text-[12px] transition-colors " +
                (idx === i
                  ? "border-ai/50 bg-ai/10 font-medium text-foreground"
                  : "border-border text-muted-foreground hover:border-ai/40 hover:text-foreground")
              }
            >
              {item.q}
            </button>
          ))}
        </div>

        {/* Thesys card */}
        <div className="mt-6 rounded-2xl border border-ai/30 bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
              Thesys C1 — generative
            </span>
            <span className="text-[10.5px] text-muted-foreground">@thesysai/genui-sdk</span>
          </div>
          <PiThesysResult c1Response={fixture} />
        </div>
      </div>
    </div>
  );
}
