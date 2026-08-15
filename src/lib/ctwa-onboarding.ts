/**
 * Mock Meta Ads + WhatsApp linkage for the CTWA Ads Manager.
 *
 * Mirrors {@link file://./waba-onboarding.ts}: the same select-existing-assets
 * shape, the same staged provisioning theatre, the same "build a result object
 * from the choices captured in the popup" helper. Identifiers reuse the WABA
 * fixtures where they overlap so the two Channels surfaces describe one
 * coherent merchant rather than two unrelated demos.
 *
 * BACKEND: the real flow is Meta's OAuth dialog with `ads_management`,
 * `business_management` and `whatsapp_business_messaging` scopes, then a token
 * exchange. Nothing here performs a network call and no token is ever held.
 */
import type { AdAccountConnection } from "@/lib/ctwa-types";

/** Business Portfolios the merchant already owns. Ids match the WABA fixtures. */
export const AD_PORTFOLIOS = [
  { id: "1789442100981", name: "Paytm Commerce", meta: "3 WABAs · 2 ad accounts" },
  { id: "2204118890034", name: "One97 Communications", meta: "1 WABA · verified" },
] as const;

/** Ad accounts under a portfolio. */
export const AD_ACCOUNTS = [
  { id: "act_4471290017", name: "Pi Commerce · India", meta: "INR · active" },
  { id: "act_9920184455", name: "Pi Commerce · Test", meta: "INR · sandbox" },
] as const;

/** Facebook Pages eligible to run Click-to-WhatsApp ads. */
export const AD_PAGES = [
  { id: "10218844902213", name: "Paytm Commerce", meta: "Verified · 128K followers" },
  { id: "10554419002871", name: "PiWealth", meta: "9.4K followers" },
] as const;

/** WhatsApp numbers a CTWA ad can point at — must sit on a connected WABA. */
export const AD_DESTINATION_NUMBERS = [
  { id: "10934471290017", display: "+91 98100 12345", meta: "Paytm Commerce WABA · verified" },
  { id: "10918822450091", display: "+91 90045 88210", meta: "Paytm Commerce WABA · verified" },
] as const;

/** Permissions the mock OAuth dialog asks for. */
export const ADS_PERMISSIONS = [
  { scope: "ads_management", detail: "Create and manage ads on your behalf" },
  { scope: "ads_read", detail: "Read delivery and performance data" },
  { scope: "business_management", detail: "Read your Business Portfolio assets" },
  { scope: "pages_show_list", detail: "List Pages you can advertise from" },
  { scope: "whatsapp_business_messaging", detail: "Receive inbound Click-to-WhatsApp conversations" },
] as const;

export const ADS_PROVISIONING_STEPS = [
  { key: "token", label: "Token exchange", detail: "Exchanging Meta token code for a long-lived token" },
  { key: "assets", label: "Asset discovery", detail: "Reading ad accounts, Pages and WABAs in the portfolio" },
  { key: "webhook", label: "Webhook subscription", detail: "Subscribing to ad delivery & inbound message events" },
  { key: "capi", label: "Conversions API", detail: "Registering the business messaging conversion endpoint" },
] as const;

/** The canonical connection a successful demo run produces. */
export const DEMO_AD_CONNECTION: AdAccountConnection = {
  fbBusinessId: "1789442100981",
  fbBusinessName: "Paytm Commerce",
  fbPageId: "10218844902213",
  fbPageName: "Paytm Commerce",
  adAccountId: "act_4471290017",
  wabaId: "104882190034771",
  wabaPhoneNumber: "+91 98100 12345",
  status: "connected",
  connectedAt: "12 Jun 2026, 04:38 IST",
};

/** Builds a connection from the choices captured in the popup, with demo fallbacks. */
export function buildAdConnection(overrides: {
  fbBusinessId?: string;
  fbBusinessName?: string;
  fbPageId?: string;
  fbPageName?: string;
  adAccountId?: string;
  wabaPhoneNumber?: string;
}): AdAccountConnection {
  const d = DEMO_AD_CONNECTION;
  return {
    fbBusinessId: overrides.fbBusinessId || d.fbBusinessId,
    fbBusinessName: overrides.fbBusinessName?.trim() || d.fbBusinessName,
    fbPageId: overrides.fbPageId || d.fbPageId,
    fbPageName: overrides.fbPageName?.trim() || d.fbPageName,
    adAccountId: overrides.adAccountId || d.adAccountId,
    wabaId: d.wabaId,
    wabaPhoneNumber: overrides.wabaPhoneNumber || d.wabaPhoneNumber,
    status: "connected",
    connectedAt: d.connectedAt,
  };
}
