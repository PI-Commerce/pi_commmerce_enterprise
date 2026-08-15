/**
 * The faux macOS "Log in With Facebook" window and the Meta form primitives that
 * live inside it.
 *
 * These deliberately bypass the Pi Commerce design system so the Meta steps match
 * Meta's production UI 1:1 — an engineer building the real integration should not
 * have to guess which pixels are ours and which are Meta's. Shared by WhatsApp
 * Embedded Signup and the CTWA ad-account connect flow so the two popups can't
 * drift apart.
 */
import { ArrowRightLeft, ChevronDown, ExternalLink, RotateCw, User } from "lucide-react";

export const META_APP_NAME = "Pi Commerce";

export function MetaWindow({
  onClose,
  title = "Log in With Facebook",
  url = "facebook.com/v20.0/dialog/oauth?app_id=50102282838542&cbt=172…",
  children,
}: {
  onClose: () => void;
  title?: string;
  url?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/10">
      {/* Title bar */}
      <div className="relative flex items-center justify-center border-b border-[#d8dadf] bg-[#e9ebef] px-3 py-2.5">
        <div className="absolute left-3 flex items-center gap-1.5">
          <button onClick={onClose} aria-label="Close" className="h-3 w-3 rounded-full bg-[#ff5f57] ring-1 ring-black/10" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e] ring-1 ring-black/10" />
          <span className="h-3 w-3 rounded-full bg-[#28c840] ring-1 ring-black/10" />
        </div>
        <span className="text-[12px] font-semibold text-[#4b4f56]">{title}</span>
      </div>

      {/* Address bar */}
      <div className="flex items-center gap-2 border-b border-[#d8dadf] bg-[#f5f6f8] px-3 py-1.5">
        <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-[#8a8d91]" />
        <div className="flex-1 truncate text-[12px] text-[#1c1e21]">{url}</div>
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
export function MetaLogo() {
  return (
    <svg width="22" height="14" viewBox="0 0 24 24" fill="#1c1e21" aria-hidden="true">
      <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.166-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.084-.282z" />
    </svg>
  );
}

/* ============================== Meta primitives ============================== */

export function Primary({ children, onClick, disabled, full }: {
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

export function Secondary({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-[#e4e6eb] px-4 py-2 text-[14px] font-semibold text-[#1c1e21] transition-colors hover:bg-[#d8dadf]"
    >
      {children}
    </button>
  );
}

export function FbLink({ children }: { children: React.ReactNode }) {
  return <span className="cursor-pointer text-[#0866FF] hover:underline">{children}</span>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[13px] font-semibold text-[#1c1e21]">{children}</label>;
}

export function Help({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[12px] leading-snug text-[#65676b]">{children}</p>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-md border border-[#ccd0d5] bg-white px-3 text-[14px] text-[#1c1e21] outline-none transition placeholder:text-[#8a8d91] focus:border-[#0866FF] focus:ring-2 focus:ring-[#0866FF]/20 ${props.className ?? ""}`}
    />
  );
}

export function Select({ value, onChange, children }: {
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
