import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ConnectionDetailHeader } from "@/components/connections/ConnectionDetailHeader";
import { ArrowLeft, Check, Copy, ArrowRight, Webhook } from "lucide-react";
import {
  pushTarget, isListedPushTarget, pushBody, campaignFields,
} from "@/lib/connections";
import { EXAMPLE_CAMPAIGN_NAMES } from "@/lib/campaign-examples";

export const Route = createFileRoute("/integrations/tool/$key")({
  component: PushToolDetail,
  head: () => ({ meta: [{ title: "Engagement tool · Pi Commerce Enterprise" }] }),
});

/**
 * One engagement tool.
 *
 * This page is documentation, not configuration — there is nothing here to save.
 * Everything a client must do to send us people happens inside *their* product, so
 * the job of this screen is to hand them the exact text to paste there and then get
 * out of the way.
 *
 * It deliberately does not show an endpoint. The endpoint carries a run id, and a
 * plausible-looking URL with no run behind it is worse than no URL at all: it is
 * the one thing on the page someone would copy without reading. The campaign picker
 * exists for the same reason in reverse — the body is only truthful when it is
 * generated from a real Audience node, so we ask which campaign rather than
 * inventing field names that would be pasted verbatim and silently never match.
 */
function PushToolDetail() {
  const { key } = Route.useParams();
  const navigate = useNavigate();
  const [campaignId, setCampaignId] = useState(EXAMPLE_CAMPAIGN_NAMES[0]?.id ?? "");
  const [copied, setCopied] = useState(false);

  const tool = pushTarget(key);
  const body = useMemo(
    () => pushBody(key, campaignFields(campaignId)),
    [key, campaignId],
  );

  const copy = () => {
    navigator.clipboard?.writeText(body);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (!isListedPushTarget(key)) {
    return (
      <AppShell>
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <h2 className="text-lg font-semibold">Tool not found</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Anything that can POST JSON works — pick API payload on a run.
          </p>
          <Button variant="outline" size="sm" className="mt-5 h-8 gap-1.5 text-xs" asChild>
            <Link to="/integrations"><ArrowLeft className="h-3.5 w-3.5" /> All connections</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* No `meta`, and that is the point: this page used to wear a green "Live" pill
          directly above the paragraph saying there is nothing to authorise and
          nothing to keep in sync. Nothing is configured here, so there is no state to
          report — the header omits the row rather than filling it. */}
      <ConnectionDetailHeader
        mark={tool}
        title={tool.name}
        description={`The campaign is built here; ${tool.name} triggers it as each person qualifies — we don't read anything out of it. There is nothing to authorise and nothing to keep in sync: you paste one body into a journey, and that journey feeds one run.`}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ─────────────────────────── The body ─────────────────────────── */}
        <section className="min-w-0 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[13px] font-semibold">Body to configure</h2>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                Keys come from the campaign's Audience node, so nothing has to be
                mapped afterwards.
              </p>
            </div>
            <div className="w-[240px] shrink-0 space-y-1">
              <Label className="text-[11px] text-muted-foreground">Preview for campaign</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXAMPLE_CAMPAIGN_NAMES.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="min-w-0 space-y-1.5 rounded-md border border-input bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">{tool.name} syntax</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 gap-1.5 text-[11px]"
                onClick={copy}
              >
                {copied
                  ? <><Check className="h-3 w-3 text-success" /> Copied</>
                  : <><Copy className="h-3 w-3" /> Copy</>}
              </Button>
            </div>
            <pre className="min-w-0 overflow-x-auto rounded border border-border bg-background px-2.5 py-2 font-mono text-[11.5px] leading-relaxed">
              {body}
            </pre>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              POST one flat-JSON object per audience record. Paste this into{" "}
              <span className="font-medium text-foreground">{tool.pasteInto}</span>.
            </p>
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <Webhook className="mt-0.5 h-3 w-3 shrink-0" />
            Change the campaign above and the keys change with it — which is the whole
            reason the body is generated rather than documented. A campaign that gains
            a field gains it here too.
          </p>
        </section>

        {/* ─────────────────────── How a run gets wired ─────────────────── */}
        <section className="min-w-0 rounded-xl border border-border bg-card p-4 lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-[13px] font-semibold">Setting up a run</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            The endpoint carries a run ID, so it is issued when you create the run —
            not from this page.
          </p>

          <ol className="mt-3 space-y-3">
            <Step n={1}>
              Start a run on the campaign you want, and choose{" "}
              <span className="font-medium text-foreground">API payload</span> as the
              audience source.
            </Step>
            <Step n={2}>
              Pick <span className="font-medium text-foreground">{tool.name}</span> as the
              tool. That sets the personalisation syntax in the generated body.
            </Step>
            <Step n={3}>
              Save. You'll get the run's endpoint, a sample request, and this body — all
              copyable, and repeatable later from the run's row.
            </Step>
            <Step n={4}>
              In {tool.name}, point {tool.pasteInto} at that endpoint and paste the body.
            </Step>
          </ol>

          <Button
            size="sm"
            className="mt-4 h-8 w-full gap-1.5 text-xs"
            onClick={() => navigate({ to: "/campaigns" })}
          >
            Go to campaigns <ArrowRight className="h-3.5 w-3.5" />
          </Button>

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            One journey feeds one run. If you run the same campaign again, you get a new
            endpoint — the old journey keeps pointing at the finished run rather than
            leaking people into it.
          </p>
        </section>
      </div>
    </AppShell>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground">
        {n}
      </span>
      <span className="text-[12px] leading-relaxed text-muted-foreground">{children}</span>
    </li>
  );
}
