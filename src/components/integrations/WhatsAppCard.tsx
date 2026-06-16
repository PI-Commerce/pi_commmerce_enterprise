import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppEmbeddedSignup } from "./WhatsAppEmbeddedSignup";
import { useWabaConnection, setWabaConnection } from "@/lib/waba-store";
import { useRegion, localizeDialCode } from "@/lib/region";

/**
 * WhatsApp Business channel card (Integrations → Channels).
 *
 * Starts disconnected so the full Meta Embedded Signup can be demoed live:
 *   Connect → {@link WhatsAppEmbeddedSignup} popup → onComplete stores the WABA.
 *   Manage  → navigates to the full /integrations/whatsapp Manage page.
 *
 * Connection lives in the shared {@link useWabaConnection} store so it survives
 * navigation to the Manage page. Mirrors the generic Card markup in
 * routes/integrations.index.tsx so it sits cleanly in the same grid.
 */
export function WhatsAppCard() {
  const connected = useWabaConnection();
  const { dialCode } = useRegion();
  const [signupOpen, setSignupOpen] = useState(false);

  const isConnected = !!connected;
  const meta = connected
    ? `${connected.waba.displayName} · ${localizeDialCode(connected.phone.display, dialCode)}`
    : "Pi Commerce is your BSP · go live in minutes";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#25D366]/15 text-[#1FA855]">
          <MessageCircle className="h-4 w-4" />
        </div>
        {isConnected ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10.5px] font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10.5px] text-muted-foreground">
            Not connected
          </span>
        )}
      </div>
      <h3 className="mt-3 text-[14px] font-semibold">WhatsApp Business</h3>
      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{meta}</p>
      <div className="mt-3 flex justify-end">
        {isConnected ? (
          <Button asChild size="sm" variant="outline" className="h-7 text-[11.5px]">
            <Link to="/integrations/whatsapp">Manage</Link>
          </Button>
        ) : (
          <Button size="sm" className="h-7 text-[11.5px]" onClick={() => setSignupOpen(true)}>
            Connect
          </Button>
        )}
      </div>

      <WhatsAppEmbeddedSignup
        open={signupOpen}
        onOpenChange={setSignupOpen}
        onComplete={(result) => setWabaConnection(result)}
      />
    </div>
  );
}
