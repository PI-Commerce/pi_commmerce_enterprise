import { useEffect, useRef, useState } from "react";
import * as Dlg from "@radix-ui/react-dialog";
import {
  Check, Loader2, ChevronDown, RotateCw, Info, KeyRound, MessageCircle,
  RefreshCw, User, ArrowRightLeft, ExternalLink, Plus,
} from "lucide-react";
import {
  WABA_CATEGORIES, COUNTRIES, PROVISIONING_STEPS, EXISTING_WABAS,
  buildResult, type ConnectedWaba,
} from "@/lib/waba-onboarding";
import { useRegion } from "@/lib/region";

/**
 * Meta Embedded Signup — a faithful replica of Meta's real popup.
 *
 * This deliberately bypasses the Pi Commerce design system for the Meta steps so
 * the screens match Meta's production UI 1:1 (the "[Meta Pop-up]" screens in the
 * PRD), so an engineer building the real integration is not confused by styling
 * drift. Everything renders inside a faux macOS "Log in With Facebook" window:
 *
 *   auth     → "Continue as {user}?"  (OAuth consent)
 *   intro    → "Connect your account to Pi Commerce"  (permission / Get started)
 *   business → step 1 · Fill in your business information
 *   waba     → step 2 · Create or select your WhatsApp Business Account
 *   profile  → step 3 · Create a WhatsApp Business profile
 *   phone    → step 4 · Add a phone number for WhatsApp
 *   otp      → step 5 · Verify your phone number
 *
 * Control then returns to Pi Commerce (our design system) for backend
 * provisioning + a success summary. Mock only — no real Meta/Facebook calls.
 */

type Step =
  | "auth" | "intro" | "business" | "waba" | "profile" | "phone" | "otp"
  | "provisioning" | "success";

/** The five wizard steps shown by the left vertical stepper. */
const WIZARD: Step[] = ["business", "waba", "profile", "phone", "otp"];

const APP_NAME = "Pi Commerce";
const FB_USER = "Madhu Patel"; // the Facebook account performing the login (PRD example)

function isMetaStep(s: Step) {
  return s !== "provisioning" && s !== "success";
}

export function WhatsAppEmbeddedSignup({
  open, onOpenChange, onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onComplete: (result: ConnectedWaba) => void;
}) {
  const [step, setStep] = useState<Step>("auth");
  const { countryName, country: regionCountry, dialCode, samplePhone } = useRegion();

  // Prefilled with Paytm demo values so the flow narrates fast and "Next" is live.
  const [bizName, setBizName] = useState("Paytm Commerce");
  const [bizEmail, setBizEmail] = useState("merchant@paytm.com");
  const [website, setWebsite] = useState("https://paytm.com");
  const [country, setCountry] = useState(countryName);

  const [wabaChoice, setWabaChoice] = useState("__new__");
  const [profileChoice, setProfileChoice] = useState("__new__");

  const [wabaAccountName, setWabaAccountName] = useState("Paytm Commerce");
  const [displayName, setDisplayName] = useState("Paytm Commerce");
  const [category, setCategory] = useState("Finance and Banking");

  const [countryCode, setCountryCode] = useState(`${regionCountry} ${dialCode}`);
  const [phoneNumber, setPhoneNumber] = useState(samplePhone);
  const [verifyBy, setVerifyBy] = useState<"sms" | "call">("sms");
  const [otp, setOtp] = useState("");

  // Keep the country-specific prefills in sync with the active workspace country
  // (also corrects for localStorage hydration, which resolves after first mount).
  // The country selector lives on the Dashboard, so this never fires mid-signup.
  useEffect(() => {
    setCountry(countryName);
    setCountryCode(`${regionCountry} ${dialCode}`);
    setPhoneNumber(samplePhone);
  }, [countryName, regionCountry, dialCode, samplePhone]);

  const [provIndex, setProvIndex] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Fresh start on each open so the flow is replayable in a live demo.
  useEffect(() => {
    if (open) { setStep("auth"); setProvIndex(0); setOtp(""); }
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [open]);

  // Provisioning animation → tick the backend steps, then land on success.
  useEffect(() => {
    if (step !== "provisioning") return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    PROVISIONING_STEPS.forEach((_, i) => {
      timers.current.push(setTimeout(() => setProvIndex(i + 1), 650 * (i + 1)));
    });
    timers.current.push(setTimeout(() => setStep("success"), 650 * (PROVISIONING_STEPS.length + 1)));
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [step]);

  const result = (): ConnectedWaba => {
    const existingWaba = EXISTING_WABAS.find((w) => w.id === wabaChoice);
    return buildResult({
      portfolioName: bizName,
      wabaName: existingWaba?.name ?? `${wabaAccountName} WABA`,
      wabaId: existingWaba?.id,
      displayName,
      category,
      phone: `${countryCode.replace(/^[A-Z]+\s/, "")} ${phoneNumber}`,
    });
  };

  const finish = () => { onComplete(result()); onOpenChange(false); };

  const back = () => {
    const order: Step[] = ["auth", "intro", "business", "waba", "profile", "phone", "otp"];
    const i = order.indexOf(step);
    if (i > 0) setStep(order[i - 1]);
  };

  const meta = isMetaStep(step);

  return (
    <Dlg.Root open={open} onOpenChange={onOpenChange}>
      <Dlg.Portal>
        <Dlg.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dlg.Content
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <Dlg.Title className="sr-only">Connect WhatsApp Business</Dlg.Title>
          <Dlg.Description className="sr-only">Meta Embedded Signup for WhatsApp Business</Dlg.Description>

          {meta ? (
            <MetaWindow onClose={() => onOpenChange(false)}>
              {step === "auth" && (
                <AuthScreen onCancel={() => onOpenChange(false)} onContinue={() => setStep("intro")} />
              )}
              {step === "intro" && <IntroScreen onNext={() => setStep("business")} />}
              {step === "business" && (
                <BusinessScreen
                  step={step} onBack={back} onNext={() => setStep("waba")}
                  bizName={bizName} setBizName={setBizName}
                  bizEmail={bizEmail} setBizEmail={setBizEmail}
                  website={website} setWebsite={setWebsite}
                  country={country} setCountry={setCountry}
                />
              )}
              {step === "waba" && (
                <WabaScreen
                  step={step} onBack={back} onNext={() => setStep("profile")}
                  waba={wabaChoice} setWaba={setWabaChoice}
                  profile={profileChoice} setProfile={setProfileChoice}
                />
              )}
              {step === "profile" && (
                <ProfileScreen
                  step={step} onBack={back} onNext={() => setStep("phone")}
                  accountName={wabaAccountName} setAccountName={setWabaAccountName}
                  displayName={displayName} setDisplayName={setDisplayName}
                  category={category} setCategory={setCategory}
                />
              )}
              {step === "phone" && (
                <PhoneScreen
                  step={step} onBack={back} onNext={() => setStep("otp")}
                  countryCode={countryCode} setCountryCode={setCountryCode}
                  phoneNumber={phoneNumber} setPhoneNumber={setPhoneNumber}
                  verifyBy={verifyBy} setVerifyBy={setVerifyBy}
                />
              )}
              {step === "otp" && (
                <OtpScreen
                  step={step} onBack={back} onNext={() => setStep("provisioning")}
                  number={`${countryCode} ${phoneNumber}`} verifyBy={verifyBy}
                  otp={otp} setOtp={setOtp}
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

/* ========================= macOS "Log in With Facebook" window ========================= */

function MetaWindow({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/10">
      {/* Title bar */}
      <div className="relative flex items-center justify-center border-b border-[#d8dadf] bg-[#e9ebef] px-3 py-2.5">
        <div className="absolute left-3 flex items-center gap-1.5">
          <button onClick={onClose} aria-label="Close" className="h-3 w-3 rounded-full bg-[#ff5f57] ring-1 ring-black/10" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e] ring-1 ring-black/10" />
          <span className="h-3 w-3 rounded-full bg-[#28c840] ring-1 ring-black/10" />
        </div>
        <span className="text-[12px] font-semibold text-[#4b4f56]">Log in With Facebook</span>
      </div>

      {/* Address bar */}
      <div className="flex items-center gap-2 border-b border-[#d8dadf] bg-[#f5f6f8] px-3 py-1.5">
        <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-[#8a8d91]" />
        <div className="flex-1 truncate text-[12px] text-[#1c1e21]">
          facebook.com/v20.0/dialog/oauth?app_id=50102282838542&amp;cbt=172…
        </div>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#8a8d91]" />
      </div>

      {/* Meta product toolbar */}
      <div className="flex items-center justify-between border-b border-[#dadde1] bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <MetaLogo />
          <RotateCw className="h-4 w-4 text-[#1c1e21]" />
          <span className="grid h-5 w-5 place-items-center rounded-full bg-[#0866FF] text-[10px] font-bold leading-none text-white">P</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="relative grid h-6 w-6 place-items-center rounded-full bg-[#e4e6eb] text-[#65676b]">
            <User className="h-3.5 w-3.5" />
            <span className="absolute -bottom-0.5 -right-0.5 grid h-3 w-3 place-items-center rounded-full bg-[#0866FF] text-[7px] font-bold leading-none text-white ring-[1.5px] ring-white">f</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-[#65676b]" />
        </div>
      </div>

      {/* Screen body */}
      <div className="text-[#1c1e21]">{children}</div>
    </div>
  );
}

/** Compact Meta "infinity" mark (simple-icons path), tinted to match the toolbar. */
function MetaLogo() {
  return (
    <svg width="22" height="14" viewBox="0 0 24 24" fill="#1c1e21" aria-hidden="true">
      <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.166-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.084-.282z" />
    </svg>
  );
}

/* ============================== Meta primitives ============================== */

function Primary({ children, onClick, disabled, full }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; full?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-[14px] font-semibold text-white transition-colors ${full ? "w-full" : ""} ${
        disabled ? "cursor-not-allowed bg-[#0866FF]/40" : "bg-[#0866FF] hover:bg-[#0758d8]"
      }`}
    >
      {children}
    </button>
  );
}

function Secondary({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-[#e4e6eb] px-4 py-2 text-[14px] font-semibold text-[#1c1e21] transition-colors hover:bg-[#d8dadf]"
    >
      {children}
    </button>
  );
}

function FbLink({ children }: { children: React.ReactNode }) {
  return <span className="cursor-pointer text-[#0866FF] hover:underline">{children}</span>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[13px] font-semibold text-[#1c1e21]">{children}</label>;
}

function Help({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[12px] leading-snug text-[#65676b]">{children}</p>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-md border border-[#ccd0d5] bg-white px-3 text-[14px] text-[#1c1e21] outline-none transition placeholder:text-[#8a8d91] focus:border-[#0866FF] focus:ring-2 focus:ring-[#0866FF]/20 ${props.className ?? ""}`}
    />
  );
}

function Select({ value, onChange, children }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-md border border-[#ccd0d5] bg-white pl-3 pr-9 text-[14px] text-[#1c1e21] outline-none transition focus:border-[#0866FF] focus:ring-2 focus:ring-[#0866FF]/20"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#65676b]" />
    </div>
  );
}

/** Shared wizard chrome: left 5-dot stepper rail + scrollable body + footer. */
function Wizard({ step, onBack, onNext, nextLabel = "Next", children }: {
  step: Step; onBack: () => void; onNext: () => void; nextLabel?: string; children: React.ReactNode;
}) {
  const index = WIZARD.indexOf(step);
  return (
    <div>
      <div className="flex">
        <Stepper index={index} />
        <div className="max-h-[58vh] flex-1 overflow-y-auto py-4 pr-5">{children}</div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[#dadde1] px-5 py-3">
        <p className="text-[11px] text-[#65676b]">
          <span className="font-semibold text-[#1c1e21]">{APP_NAME}</span>'s <FbLink>Privacy Policy</FbLink> and <FbLink>Terms</FbLink>
        </p>
        <div className="flex gap-2">
          <Secondary onClick={onBack}>Back</Secondary>
          <Primary onClick={onNext}>{nextLabel}</Primary>
        </div>
      </div>
    </div>
  );
}

function Stepper({ index }: { index: number }) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center pt-5">
      {WIZARD.map((_, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <div key={i} className="flex flex-col items-center">
            <span
              className={`grid h-5 w-5 place-items-center rounded-full border-2 ${
                done ? "border-[#31a24c] bg-[#31a24c] text-white"
                  : active ? "border-[#0866FF] bg-white"
                  : "border-[#ccd0d5] bg-white"
              }`}
            >
              {done && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            {i < WIZARD.length - 1 && (
              <span className={`my-1 h-7 w-[2px] rounded ${i < index ? "bg-[#31a24c]" : "bg-[#dadde1]"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* =============================== Meta screens =============================== */

/** A · OAuth consent — "Continue as {user}?" */
function AuthScreen({ onCancel, onContinue }: { onCancel: () => void; onContinue: () => void }) {
  return (
    <div className="px-6 py-5">
      <h2 className="text-[20px] font-bold text-[#1c1e21]">Continue as {FB_USER}?</h2>
      <p className="mt-3 text-[13px] leading-relaxed text-[#65676b]">
        {APP_NAME} will receive your name and profile picture. This doesn't let {APP_NAME} post to Facebook without your permission.
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-[#65676b]">
        You need to log in with an existing Facebook account. New accounts won't be approved for Business Manager. No one can see a personal Facebook profile unless you confirm their friend request. <FbLink>Learn more</FbLink>
      </p>
      <div className="mt-5 flex items-center gap-3">
        <Secondary onClick={onCancel}>Cancel</Secondary>
        <Primary onClick={onContinue} full>Continue as {FB_USER}</Primary>
      </div>
      <p className="mt-4 text-[13px] text-[#65676b]">
        Not {FB_USER}? <FbLink>Log into another account.</FbLink>
      </p>
      <p className="mt-8 text-[11px] leading-relaxed text-[#8a8d91]">
        By continuing, {APP_NAME} will receive ongoing access to the information you share and Facebook will record when {APP_NAME} accesses it. <FbLink>Learn more about this sharing and the settings you have.</FbLink>
      </p>
      <div className="mt-3 flex items-center justify-between text-[11px] text-[#65676b]">
        <span>
          <span className="font-semibold text-[#1c1e21]">{APP_NAME}</span>'s <FbLink>Privacy Policy</FbLink> and <FbLink>Terms</FbLink>
        </span>
        <FbLink>Help Center</FbLink>
      </div>
    </div>
  );
}

/** B · Permission intro — "Connect your account to {App}" + Get started. */
function IntroScreen({ onNext }: { onNext: () => void }) {
  return (
    <div>
      <IntroBanner />
      <div className="px-6 pb-5 pt-4">
        <h2 className="text-[18px] font-bold text-[#1c1e21]">Connect your account to {APP_NAME}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#65676b]">
          To allow {APP_NAME} to manage your WhatsApp Business Account, you'll need to share account permission.
        </p>
        <p className="mt-4 text-[13px] font-semibold text-[#1c1e21]">Permissions you'll share with {APP_NAME}</p>
        <div className="mt-2 flex items-start gap-3">
          <span className="mt-0.5 text-[#65676b]"><KeyRound className="h-4 w-4" /></span>
          <div>
            <p className="text-[13px] font-semibold text-[#1c1e21]">WhatsApp Business Account access</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#65676b]">
              {APP_NAME} will be able to add or link phone numbers, create message templates, send and receive messages, assign users to your account and access your metrics.
            </p>
          </div>
        </div>
        <p className="mt-4 text-[12.5px] leading-relaxed text-[#65676b]">
          By continuing, you agree to the <FbLink>WhatsApp Business Terms of Service</FbLink> and the <FbLink>Meta Terms of Service.</FbLink>
        </p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-[11px] text-[#65676b]">
            <span className="font-semibold text-[#1c1e21]">{APP_NAME}</span>'s <FbLink>Privacy Policy</FbLink> and <FbLink>Terms</FbLink>
          </p>
          <Primary onClick={onNext}>Get started</Primary>
        </div>
      </div>
    </div>
  );
}

/** Decorative banner approximating Meta's onboarding illustration. */
function IntroBanner() {
  return (
    <div className="relative h-28 overflow-hidden bg-gradient-to-r from-[#e7f0ff] via-[#eef6ff] to-[#e6f8ee]">
      <span className="absolute left-6 top-5 h-7 w-12 rounded-lg bg-white/80 shadow-sm ring-1 ring-black/5" />
      <span className="absolute left-16 top-12 h-6 w-16 rounded-lg bg-white/70 shadow-sm ring-1 ring-black/5" />
      <span className="absolute left-28 top-4 grid h-9 w-9 place-items-center rounded-full bg-[#25D366] text-white shadow">
        <MessageCircle className="h-5 w-5" />
      </span>
      <span className="absolute right-20 top-7 h-10 w-10 rounded-full bg-[#cfe2c2]" />
      <span className="absolute right-6 bottom-0 h-14 w-16 rounded-t-[40%] bg-[#7a9b6f]" />
      <span className="absolute right-9 top-4 h-9 w-9 rounded-full bg-[#d7b8a3]" />
    </div>
  );
}

/** C · Step 1 — business information. */
function BusinessScreen(p: {
  step: Step; onBack: () => void; onNext: () => void;
  bizName: string; setBizName: (v: string) => void;
  bizEmail: string; setBizEmail: (v: string) => void;
  website: string; setWebsite: (v: string) => void;
  country: string; setCountry: (v: string) => void;
}) {
  return (
    <Wizard step={p.step} onBack={p.onBack} onNext={p.onNext}>
      <h2 className="text-[16px] font-bold text-[#1c1e21]">Fill in your business information</h2>
      <p className="mt-1 mb-4 text-[12.5px] leading-snug text-[#65676b]">
        Select an existing or create a new business portfolio to add your phone number. Your audience will not see this information on your WhatsApp profile.
      </p>

      <div className="space-y-3.5">
        <div>
          <Label>Business name</Label>
          <div className="relative">
            <Input value={p.bizName} maxLength={100} onChange={(e) => p.setBizName(e.target.value)} className="pr-14" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#8a8d91]">{p.bizName.length}/100</span>
          </div>
        </div>
        <div>
          <Label>Business Email</Label>
          <Help>You'll receive an email to verify it.</Help>
          <Input value={p.bizEmail} onChange={(e) => p.setBizEmail(e.target.value)} />
        </div>
        <div>
          <Label>Business website or profile page</Label>
          <Help>If you don't have a business website, you can use a URL from any of your social media profile pages. This should be a website/social media page for your business.</Help>
          <Input value={p.website} onChange={(e) => p.setWebsite(e.target.value)} />
        </div>
        <div>
          <Label>Country</Label>
          <Select value={p.country} onChange={p.setCountry}>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-md border border-[#ccd0d5] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#1c1e21] transition-colors hover:bg-[#f0f2f5]">
          <Plus className="h-3.5 w-3.5" /> Add Address (optional)
        </button>
      </div>
    </Wizard>
  );
}

/** D · Step 2 — WhatsApp Business Account. */
function WabaScreen(p: {
  step: Step; onBack: () => void; onNext: () => void;
  waba: string; setWaba: (v: string) => void;
  profile: string; setProfile: (v: string) => void;
}) {
  return (
    <Wizard step={p.step} onBack={p.onBack} onNext={p.onNext}>
      <h2 className="text-[16px] font-bold text-[#1c1e21]">Create or select your WhatsApp Business Account</h2>
      <p className="mt-1 mb-4 text-[12.5px] leading-snug text-[#65676b]">
        This WhatsApp Business Account will belong to your business portfolio
      </p>
      <div className="space-y-3.5">
        <div>
          <Label>Choose a WhatsApp Business Account</Label>
          <Select value={p.waba} onChange={p.setWaba}>
            <option value="__new__">Create a WhatsApp Business Account</option>
            {EXISTING_WABAS.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Create or Select a WhatsApp Business Profile</Label>
          <Select value={p.profile} onChange={p.setProfile}>
            <option value="__new__">Create a new WhatsApp Business profile</option>
            <option value="existing">Use an existing WhatsApp Business profile</option>
          </Select>
        </div>
      </div>
    </Wizard>
  );
}

/** E · Step 3 — WhatsApp Business profile. */
function ProfileScreen(p: {
  step: Step; onBack: () => void; onNext: () => void;
  accountName: string; setAccountName: (v: string) => void;
  displayName: string; setDisplayName: (v: string) => void;
  category: string; setCategory: (v: string) => void;
}) {
  return (
    <Wizard step={p.step} onBack={p.onBack} onNext={p.onNext}>
      <h2 className="text-[16px] font-bold text-[#1c1e21]">Create a WhatsApp Business profile</h2>
      <p className="mt-1 mb-4 text-[12.5px] leading-snug text-[#65676b]">
        This profile will show information about your business to people on WhatsApp. You can edit this information anytime by going to <span className="font-semibold text-[#1c1e21]">Business assets</span> in Meta Business Suite <span className="font-semibold text-[#1c1e21]">Settings</span> and selecting this WhatsApp account.
      </p>

      <div className="space-y-3.5">
        <div>
          <span className="mb-1 flex items-center gap-1 text-[13px] font-semibold text-[#1c1e21]">
            WhatsApp Business Account Name <Info className="h-3.5 w-3.5 text-[#65676b]" />
          </span>
          <div className="relative">
            <Input value={p.accountName} maxLength={255} onChange={(e) => p.setAccountName(e.target.value)} className="pr-14" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#8a8d91]">{p.accountName.length}/255</span>
          </div>
        </div>
        <div>
          <Label>WhatsApp Business display name</Label>
          <Help>Your display name should match your business name and adhere to WhatsApp Business display name guidelines. <FbLink>Learn more about display name guidelines</FbLink></Help>
          <Input value={p.displayName} onChange={(e) => p.setDisplayName(e.target.value)} />
        </div>
        <div className="flex items-start gap-2.5 rounded-md bg-[#f0f2f5] px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#65676b]" />
          <div className="text-[12px] leading-snug text-[#1c1e21]">
            <p className="font-semibold">Best practices for WhatsApp Business display names:</p>
            <ul className="mt-1 list-disc pl-4 text-[#65676b]">
              <li>Don't add unnecessary punctuation, emojis or symbols like trademarks.</li>
            </ul>
          </div>
        </div>
        <div>
          <Label>Category</Label>
          <Help>Select the category that best describes your business.</Help>
          <Select value={p.category} onChange={p.setCategory}>
            {WABA_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <FbLink>Show more options ▾</FbLink>
      </div>
    </Wizard>
  );
}

/** F · Step 4 — phone number. */
function PhoneScreen(p: {
  step: Step; onBack: () => void; onNext: () => void;
  countryCode: string; setCountryCode: (v: string) => void;
  phoneNumber: string; setPhoneNumber: (v: string) => void;
  verifyBy: "sms" | "call"; setVerifyBy: (v: "sms" | "call") => void;
}) {
  return (
    <Wizard step={p.step} onBack={p.onBack} onNext={p.onNext}>
      <h2 className="text-[16px] font-bold text-[#1c1e21]">Add a phone number for WhatsApp</h2>
      <p className="mt-1 mb-4 text-[12.5px] leading-snug text-[#65676b]">
        This is the number people will see when they chat with you. <FbLink>Learn how to use a number that's already on WhatsApp.</FbLink>
      </p>

      <Label>Phone number</Label>
      <div className="flex gap-2">
        <div className="w-28 shrink-0">
          <Select value={p.countryCode} onChange={p.setCountryCode}>
            {["IN +91", "US +1", "GB +44", "AE +971", "SG +65", "AU +61"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
        <Input value={p.phoneNumber} onChange={(e) => p.setPhoneNumber(e.target.value)} />
      </div>
      <p className="mt-1.5 text-[12px] text-[#65676b]">You'll receive a code to verify this number.</p>

      <p className="mt-4 text-[13px] font-semibold text-[#1c1e21]">Choose how you would like to verify your number:</p>
      <p className="mt-0.5 text-[12px] text-[#65676b]">If you are using a landline number, choose phone call.</p>
      <div className="mt-2 space-y-2">
        {([["sms", "Text message"], ["call", "Phone call"]] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => p.setVerifyBy(v)}
            className="flex w-full items-center gap-2.5 text-left"
          >
            <span className={`grid h-4 w-4 place-items-center rounded-full border-2 ${p.verifyBy === v ? "border-[#0866FF]" : "border-[#ccd0d5]"}`}>
              {p.verifyBy === v && <span className="h-2 w-2 rounded-full bg-[#0866FF]" />}
            </span>
            <span className="text-[13.5px] text-[#1c1e21]">{label}</span>
          </button>
        ))}
      </div>
    </Wizard>
  );
}

/** G · Step 5 — OTP verification. */
function OtpScreen(p: {
  step: Step; onBack: () => void; onNext: () => void;
  number: string; verifyBy: "sms" | "call"; otp: string; setOtp: (v: string) => void;
}) {
  const digits = p.otp.padEnd(6, " ").slice(0, 6).split("");
  return (
    <Wizard step={p.step} onBack={p.onBack} onNext={p.onNext} nextLabel="Verify">
      <h2 className="text-[16px] font-bold text-[#1c1e21]">Verify your phone number</h2>
      <p className="mt-1 mb-4 text-[12.5px] leading-snug text-[#65676b]">
        Enter the 6-digit code we sent to <span className="font-semibold text-[#1c1e21]">{p.number}</span> via {p.verifyBy === "sms" ? "text message" : "phone call"}.
      </p>

      <div className="relative">
        <div className="pointer-events-none flex gap-2">
          {digits.map((d, i) => (
            <div
              key={i}
              className={`grid h-12 flex-1 place-items-center rounded-md border text-[18px] font-semibold text-[#1c1e21] ${
                i === p.otp.length ? "border-[#0866FF] ring-2 ring-[#0866FF]/20" : "border-[#ccd0d5]"
              }`}
            >
              {d.trim()}
            </div>
          ))}
        </div>
        <input
          autoFocus
          value={p.otp}
          onChange={(e) => p.setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          aria-label="Verification code"
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
        />
      </div>
      <p className="mt-3 text-[12.5px] text-[#65676b]">Didn't receive a code? <FbLink>Resend code</FbLink></p>
    </Wizard>
  );
}

/* ===================== Pi Commerce screens (our design system) ===================== */

function PiPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#25D366]/15 text-[#1FA855]">
          <MessageCircle className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">WhatsApp Business</h2>
          <p className="text-[12px] text-muted-foreground">Pi Commerce · BSP onboarding</p>
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
        Meta returned your WABA, phone number and token — provisioning the account now.
      </p>
      <div className="mt-4 space-y-2">
        {PROVISIONING_STEPS.map((s, i) => {
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

function SuccessScreen({ result, onDone }: { result: ConnectedWaba; onDone: () => void }) {
  const rows: [string, string][] = [
    ["Business portfolio", result.businessPortfolio.name],
    ["WhatsApp Business Account", result.waba.name],
    ["Display name", result.waba.displayName],
    ["Phone number", result.phone.display],
    ["Quality rating", result.sender.qualityRating],
    ["Messaging limit", result.sender.messagingLimitTier],
  ];
  return (
    <div className="text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
        <Check className="h-6 w-6" />
      </span>
      <h3 className="mt-3 text-[16px] font-semibold text-foreground">WhatsApp Business connected</h3>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Your account is linked to Pi Commerce and ready for templates &amp; campaigns.
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
        <RefreshCw className="h-3 w-3" /> Status syncs automatically from Meta webhooks.
      </p>
    </div>
  );
}
