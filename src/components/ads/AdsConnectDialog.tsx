/**
 * Meta Ads connect — the CTWA counterpart to WhatsApp Embedded Signup.
 *
 * Shorter than the WhatsApp flow because nothing is being *created*: the
 * merchant already owns a Business Portfolio, an ad account, a Page and a WABA
 * number, so the popup is consent plus asset selection. It reuses the same Meta
 * window chrome, then hands back to Pi Commerce for provisioning and a summary.
 *
 * BACKEND: the real thing is Meta's OAuth dialog requesting the scopes listed in
 * `ADS_PERMISSIONS`, followed by a token exchange and an asset read. Mock only —
 * no network call is made and no token is ever held.
 */
import { useEffect, useRef, useState } from "react";
import * as Dlg from "@radix-ui/react-dialog";
import { Check, KeyRound, Loader2, Megaphone, RefreshCw } from "lucide-react";
import {
  FbLink, Input, Label, MetaWindow, META_APP_NAME, Primary, Secondary, Select,
} from "@/components/integrations/MetaWindow";
import {
  ADS_PERMISSIONS, ADS_PROVISIONING_STEPS, AD_ACCOUNTS, AD_DESTINATION_NUMBERS,
  AD_PAGES, AD_PORTFOLIOS, buildAdConnection,
} from "@/lib/ctwa-onboarding";
import type { AdAccountConnection } from "@/lib/ctwa-types";

type Step = "auth" | "intro" | "assets" | "provisioning" | "success";

const FB_USER = "Madhu Patel";

export function AdsConnectDialog({
  open,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onComplete: (result: AdAccountConnection) => void;
}) {
  const [step, setStep] = useState<Step>("auth");
  const [portfolioId, setPortfolioId] = useState<string>(AD_PORTFOLIOS[0].id);
  const [adAccountId, setAdAccountId] = useState<string>(AD_ACCOUNTS[0].id);
  const [pageId, setPageId] = useState<string>(AD_PAGES[0].id);
  const [phone, setPhone] = useState<string>(AD_DESTINATION_NUMBERS[0].display);

  const [provIndex, setProvIndex] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Fresh start on each open so the flow is replayable in a live demo.
  useEffect(() => {
    if (open) { setStep("auth"); setProvIndex(0); }
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [open]);

  useEffect(() => {
    if (step !== "provisioning") return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    ADS_PROVISIONING_STEPS.forEach((_, i) => {
      timers.current.push(setTimeout(() => setProvIndex(i + 1), 650 * (i + 1)));
    });
    timers.current.push(
      setTimeout(() => setStep("success"), 650 * (ADS_PROVISIONING_STEPS.length + 1)),
    );
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [step]);

  const result = (): AdAccountConnection =>
    buildAdConnection({
      fbBusinessId: portfolioId,
      fbBusinessName: AD_PORTFOLIOS.find((p) => p.id === portfolioId)?.name,
      fbPageId: pageId,
      fbPageName: AD_PAGES.find((p) => p.id === pageId)?.name,
      adAccountId,
      wabaPhoneNumber: phone,
    });

  const finish = () => { onComplete(result()); onOpenChange(false); };
  const inMeta = step === "auth" || step === "intro" || step === "assets";

  return (
    <Dlg.Root open={open} onOpenChange={onOpenChange}>
      <Dlg.Portal>
        <Dlg.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dlg.Content
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <Dlg.Title className="sr-only">Connect Meta Ads</Dlg.Title>
          <Dlg.Description className="sr-only">
            Link a Meta ad account and WhatsApp number for Click-to-WhatsApp ads
          </Dlg.Description>

          {inMeta ? (
            <MetaWindow
              onClose={() => onOpenChange(false)}
              url="facebook.com/v20.0/dialog/oauth?app_id=50102282838542&scope=ads_management…"
            >
              {step === "auth" && (
                <AuthScreen onCancel={() => onOpenChange(false)} onContinue={() => setStep("intro")} />
              )}
              {step === "intro" && <PermissionsScreen onNext={() => setStep("assets")} />}
              {step === "assets" && (
                <AssetsScreen
                  onBack={() => setStep("intro")}
                  onNext={() => setStep("provisioning")}
                  portfolioId={portfolioId} setPortfolioId={setPortfolioId}
                  adAccountId={adAccountId} setAdAccountId={setAdAccountId}
                  pageId={pageId} setPageId={setPageId}
                  phone={phone} setPhone={setPhone}
                />
              )}
            </MetaWindow>
          ) : (
            <PiPanel>
              {step === "provisioning" && <ProvisioningScreen index={provIndex} />}
              {step === "success" && <SuccessScreen result={result()} onDone={finish} />}
            </PiPanel>
          )}
        </Dlg.Content>
      </Dlg.Portal>
    </Dlg.Root>
  );
}

/* =============================== Meta screens =============================== */

function AuthScreen({ onCancel, onContinue }: { onCancel: () => void; onContinue: () => void }) {
  return (
    <div className="px-6 py-5">
      <h2 className="text-[20px] font-bold text-[#1c1e21]">Continue as {FB_USER}?</h2>
      <p className="mt-3 text-[13px] leading-relaxed text-[#65676b]">
        {META_APP_NAME} will receive your name and profile picture. This doesn't let {META_APP_NAME} post
        to Facebook without your permission.
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-[#65676b]">
        To run Click-to-WhatsApp ads, {META_APP_NAME} needs access to an ad account and a Page in a
        Business Portfolio you administer. <FbLink>Learn more</FbLink>
      </p>
      <div className="mt-5 flex items-center gap-3">
        <Secondary onClick={onCancel}>Cancel</Secondary>
        <Primary onClick={onContinue} full>Continue as {FB_USER}</Primary>
      </div>
      <p className="mt-8 text-[11px] leading-relaxed text-[#8a8d91]">
        By continuing, {META_APP_NAME} will receive ongoing access to the information you share and
        Facebook will record when {META_APP_NAME} accesses it.
      </p>
    </div>
  );
}

function PermissionsScreen({ onNext }: { onNext: () => void }) {
  return (
    <div className="px-6 pb-5 pt-5">
      <h2 className="text-[18px] font-bold text-[#1c1e21]">Connect your ad account to {META_APP_NAME}</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[#65676b]">
        {META_APP_NAME} will create and manage Click-to-WhatsApp ads, and receive the conversations
        those ads produce.
      </p>
      <p className="mt-4 text-[13px] font-semibold text-[#1c1e21]">Permissions you'll share</p>
      <div className="mt-2 space-y-2.5">
        {ADS_PERMISSIONS.map((p) => (
          <div key={p.scope} className="flex items-start gap-3">
            <span className="mt-0.5 text-[#65676b]"><KeyRound className="h-4 w-4" /></span>
            <div>
              <p className="font-mono text-[12px] font-semibold text-[#1c1e21]">{p.scope}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-[#65676b]">{p.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-[11px] text-[#65676b]">
          <span className="font-semibold text-[#1c1e21]">{META_APP_NAME}</span>'s <FbLink>Privacy Policy</FbLink> and <FbLink>Terms</FbLink>
        </p>
        <Primary onClick={onNext}>Get started</Primary>
      </div>
    </div>
  );
}

function AssetsScreen(p: {
  onBack: () => void;
  onNext: () => void;
  portfolioId: string; setPortfolioId: (v: string) => void;
  adAccountId: string; setAdAccountId: (v: string) => void;
  pageId: string; setPageId: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
}) {
  return (
    <div>
      <div className="max-h-[58vh] overflow-y-auto px-6 py-5">
        <h2 className="text-[16px] font-bold text-[#1c1e21]">Select the assets to connect</h2>
        <p className="mb-4 mt-1 text-[12.5px] leading-snug text-[#65676b]">
          Ads will run from this Page and be billed to this ad account. The WhatsApp number is where
          people land when they tap.
        </p>

        <div className="space-y-3.5">
          <div>
            <Label>Business Portfolio</Label>
            <Select value={p.portfolioId} onChange={p.setPortfolioId}>
              {AD_PORTFOLIOS.map((o) => (
                <option key={o.id} value={o.id}>{o.name} — {o.meta}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Ad account</Label>
            <Select value={p.adAccountId} onChange={p.setAdAccountId}>
              {AD_ACCOUNTS.map((o) => (
                <option key={o.id} value={o.id}>{o.name} — {o.meta}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Facebook Page</Label>
            <Select value={p.pageId} onChange={p.setPageId}>
              {AD_PAGES.map((o) => (
                <option key={o.id} value={o.id}>{o.name} — {o.meta}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>WhatsApp destination number</Label>
            <Select value={p.phone} onChange={p.setPhone}>
              {AD_DESTINATION_NUMBERS.map((o) => (
                <option key={o.id} value={o.display}>{o.display} — {o.meta}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Conversions API dataset</Label>
            <Input value="Pi Commerce · Business messaging" readOnly />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[#dadde1] px-5 py-3">
        <p className="text-[11px] text-[#65676b]">
          <span className="font-semibold text-[#1c1e21]">{META_APP_NAME}</span>'s <FbLink>Privacy Policy</FbLink> and <FbLink>Terms</FbLink>
        </p>
        <div className="flex gap-2">
          <Secondary onClick={p.onBack}>Back</Secondary>
          <Primary onClick={p.onNext}>Connect</Primary>
        </div>
      </div>
    </div>
  );
}

/* ===================== Pi Commerce screens ===================== */

function PiPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#0866FF]/15 text-[#0866FF]">
          <Megaphone className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Meta Ads</h2>
          <p className="text-[12px] text-muted-foreground">Pi Commerce · Click-to-WhatsApp</p>
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function ProvisioningScreen({ index }: { index: number }) {
  return (
    <div>
      <h3 className="text-[14px] font-semibold text-foreground">Setting up your connection</h3>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        Meta returned your ad account, Page and WABA — subscribing to delivery and conversation events now.
      </p>
      <div className="mt-4 space-y-2">
        {ADS_PROVISIONING_STEPS.map((s, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <div
              key={s.key}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                done ? "border-success/30 bg-success/[0.04]" : active ? "border-border bg-secondary/40" : "border-border opacity-55"
              }`}
            >
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full">
                {done ? <Check className="h-4 w-4 text-success" />
                  : active ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  : <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground">{s.label}</p>
                <p className="text-[11.5px] text-muted-foreground">{s.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SuccessScreen({ result, onDone }: { result: AdAccountConnection; onDone: () => void }) {
  const rows: [string, string][] = [
    ["Business portfolio", result.fbBusinessName],
    ["Ad account", result.adAccountId],
    ["Facebook Page", result.fbPageName],
    ["WhatsApp number", result.wabaPhoneNumber],
    ["Conversions API", "Business messaging · registered"],
  ];
  return (
    <div className="text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
        <Check className="h-6 w-6" />
      </span>
      <h3 className="mt-3 text-[16px] font-semibold text-foreground">Meta Ads connected</h3>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        You can now publish Click-to-WhatsApp ads and feed conversions back to Meta.
      </p>
      <div className="mt-4 divide-y divide-border rounded-lg border border-border text-left">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 px-3 py-2">
            <span className="text-[11.5px] text-muted-foreground">{k}</span>
            <span className="truncate text-[12.5px] font-medium text-foreground">{v}</span>
          </div>
        ))}
      </div>
      <button
        onClick={onDone}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-[14px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Done
      </button>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <RefreshCw className="h-3 w-3" /> Delivery and conversation events sync from Meta webhooks.
      </p>
    </div>
  );
}
