/**
 * Ask Pi — /integrations surface: seed vendor documentation.
 *
 * Short, chunk-per-section snippets describing how to connect each vendor
 * listed on the /integrations page. Sourced from public vendor docs and
 * paraphrased into a common shape (Overview / Prerequisites / Credentials /
 * Configure in PiCommerce / Test / Troubleshoot).
 *
 * NOT authoritative — this is demo seed content that lets Pi answer "how do
 * I connect X" from a citable source. Swap to vendor-owned docs (or a real
 * embeddings index) when the vendor content team ships theirs; the tool
 * signature and system prompt stay the same.
 *
 * Add a vendor by extending VENDOR_DOCS. The `search_docs` tool auto-picks
 * it up — no dispatcher changes needed.
 */

/**
 * Doc corpus ids.
 *
 * `picom_platform` is not a third-party vendor — it's the PiCommerce
 * platform itself. It carries the "how does connecting anything work on
 * PiCommerce" facts (where PiCommerce's own API keys live, where vendor
 * credentials get pasted, how the connection lifecycle actually flows).
 * Pi should reach for these chunks whenever a user asks about "API keys"
 * or "credentials" without naming a vendor, or when a vendor answer
 * would otherwise sound like PiCommerce isn't in the picture.
 */
export type VendorId = "picom_platform" | "paytm_pg" | "clevertap" | "shopify";

export type DocChunk = {
  /** Machine id of the vendor this chunk belongs to. */
  vendor: VendorId;
  /** Human vendor name for citation ("Paytm Payment Gateway"). */
  vendorName: string;
  /** Section within the vendor doc ("Getting API credentials"). */
  section: string;
  /** The chunk body Pi reads. Kept short (~80-160 words) so retrieval
   *  can return 2-3 chunks without blowing the model's context. */
  body: string;
  /** Optional deep link back to the vendor's canonical doc — Pi surfaces
   *  this in its citation when present. */
  sourceUrl?: string;
};

export const VENDOR_DOCS: DocChunk[] = [
  // ────────────────────────────────────────────────────────────────────────
  // PiCommerce platform basics
  //
  // These chunks describe how connecting anything works on our platform
  // and — crucially — where PiCommerce's OWN API keys live (spoiler:
  // Developer > APIs & Webhooks, NOT on the Integrations page). Every
  // vendor-connect walkthrough should end by pointing back to the vendor
  // card on this page; that's where credentials actually get pasted.
  // ────────────────────────────────────────────────────────────────────────
  {
    vendor: "picom_platform",
    vendorName: "PiCommerce",
    section: "Where PiCommerce's own API keys live",
    body: "PiCommerce's own API keys — the ones you use to call PiCommerce's REST API programmatically, or to authenticate an outbound webhook signature — live under Developer > APIs & Webhooks, NOT on the Integrations page. The Integrations page is only for connecting third-party vendors (Paytm, CleverTap, Shopify, and so on). If someone says \"API keys\" without naming a vendor, they almost always mean the PiCommerce keys under Developer.",
  },
  {
    vendor: "picom_platform",
    vendorName: "PiCommerce",
    section: "Where vendor credentials get pasted",
    body: "Every third-party vendor connection is completed on the Integrations page (this page). Click Connect on the vendor's card, paste the credentials the vendor issued you, and save — PiCommerce validates them with a test call before flipping the card to Connected. Vendor credentials are stored encrypted in PiCommerce; you never re-enter them once connected. Vendor credentials are NOT the same thing as PiCommerce's own API keys under Developer — they authorise PiCommerce to talk to the vendor on your behalf, not the other way around.",
  },
  {
    vendor: "picom_platform",
    vendorName: "PiCommerce",
    section: "Terminology — vendors call credentials different things",
    body: "Every vendor uses their own name for the credential they issue. Paytm Payment Gateway issues a Merchant ID (MID) and a Merchant Key. CleverTap issues an Account ID and a Passcode. Shopify issues an Admin API access token (or completes OAuth for standard stores, no manual token needed). None of these are called \"API keys\" in the vendor's own dashboard — using the vendor's own terminology avoids confusing them with PiCommerce's own API keys under Developer.",
  },
  {
    vendor: "picom_platform",
    vendorName: "PiCommerce",
    section: "The connection lifecycle",
    body: "Connecting a vendor on PiCommerce is a three-step lifecycle: (1) create or fetch credentials on the vendor's own dashboard, (2) click Connect on the vendor card here on Integrations and paste them, (3) PiCommerce runs a validation call and flips the card to Connected. Once connected, campaigns, agents and audiences can reference the vendor by name — no per-node re-authentication. Disconnect from the same card if you rotate credentials; the vendor's data stays intact in PiCommerce.",
  },

  // ────────────────────────────────────────────────────────────────────────
  // Paytm Payment Gateway
  // ────────────────────────────────────────────────────────────────────────
  {
    vendor: "paytm_pg",
    vendorName: "Paytm Payment Gateway",
    section: "Overview",
    body: "Paytm Payment Gateway (PG) is a single integration that accepts UPI, credit and debit cards, netbanking, wallets, EMI and payment links. Once connected in PiCommerce, campaigns can attach a checkout link to any WhatsApp, SMS or RCS node and settlement events flow back into the run timeline. PG is the recommended payment integration for any campaign that collects money in India.",
    sourceUrl: "https://business.paytm.com/docs/pg/",
  },
  {
    vendor: "paytm_pg",
    vendorName: "Paytm Payment Gateway",
    section: "Prerequisites",
    body: "Before you connect, make sure your business has an active Paytm for Business account and has completed KYC (PAN, GSTIN, bank proof). Payouts require a settlement account added under Settings > Bank details in the Paytm dashboard. If you do not have an account yet, sign up at business.paytm.com and complete KYC first — it typically takes 24-48 hours to approve.",
  },
  {
    vendor: "paytm_pg",
    vendorName: "Paytm Payment Gateway",
    section: "Getting credentials from Paytm",
    body: "Paytm issues two credentials for the payment gateway: a Merchant ID (MID) and a Merchant Key. Get them from the Paytm for Business dashboard (business.paytm.com) — open the API Keys screen under Developer Settings there, and generate a pair for Staging and a pair for Production. Copy all four values. These are Paytm's credentials, distinct from PiCommerce's own API keys (which live under PiCommerce Developer > APIs & Webhooks and are unrelated to any vendor connection). Never share the Merchant Key; treat it like a password.",
    sourceUrl: "https://business.paytm.com/docs/pg/api-keys/",
  },
  {
    vendor: "paytm_pg",
    vendorName: "Paytm Payment Gateway",
    section: "Pasting Paytm credentials into PiCommerce",
    body: "Once you have Merchant ID + Merchant Key from Paytm, come back to PiCommerce's Integrations page (this page), click Connect on the Paytm Payment Gateway card, and paste the values in the dialog. Pick Environment (Staging for test, Production for live) and save. PiCommerce validates the pair with a test call to Paytm and flips the card to Connected. The credentials are stored encrypted in PiCommerce — you don't re-enter them per campaign.",
  },
  {
    vendor: "paytm_pg",
    vendorName: "Paytm Payment Gateway",
    section: "Configure in PiCommerce",
    body: "On the Integrations page, click Connect on the Paytm Payment Gateway card. Paste your Merchant ID and Merchant Key, choose Environment (Staging for testing, Production for live), and save. PiCommerce validates the credentials with a test call before marking the integration Connected. Campaigns can now reference the paytm_pg checkout link asset in any messaging node.",
  },
  {
    vendor: "paytm_pg",
    vendorName: "Paytm Payment Gateway",
    section: "Test the integration",
    body: "With the integration in Staging mode, create a test campaign, add a WhatsApp node with a payment link, and run it to a test contact. Complete the checkout using Paytm's test card 4242 4242 4242 4242 (any future expiry, CVV 123). The success event should land in the run timeline within 30 seconds. Switch to Production once the flow works end-to-end.",
  },
  {
    vendor: "paytm_pg",
    vendorName: "Paytm Payment Gateway",
    section: "Troubleshooting",
    body: "If the connection fails, the two most common causes are: (1) the Merchant Key was copied from the wrong environment — Staging keys do not work in Production and vice versa; (2) the Paytm account has pending KYC and cannot issue live keys. If callbacks are not landing, check that the callback URL in Paytm dashboard matches PiCommerce's webhook endpoint (auto-filled during Connect).",
  },

  // ────────────────────────────────────────────────────────────────────────
  // CleverTap
  // ────────────────────────────────────────────────────────────────────────
  {
    vendor: "clevertap",
    vendorName: "CleverTap",
    section: "Overview",
    body: "CleverTap is a customer data platform. When connected, PiCommerce pulls user profiles and event streams from CleverTap so campaigns can target real segments and personalise messages with live traits (last purchase, LTV, tier). Segment membership changes in CleverTap propagate to running campaigns within a few minutes.",
    sourceUrl: "https://developer.clevertap.com/docs/",
  },
  {
    vendor: "clevertap",
    vendorName: "CleverTap",
    section: "Prerequisites",
    body: "You need an active CleverTap account with dashboard access. The user connecting the integration must have Admin role in CleverTap — the connection creates an API user and a Passcode, and only Admins can mint those. If your account is on the EU or India-1 data region, note the region — you will pick it during Connect.",
  },
  {
    vendor: "clevertap",
    vendorName: "CleverTap",
    section: "Getting credentials from CleverTap",
    body: "CleverTap issues an Account ID and a Passcode (the API Passcode, distinct from your login password). Get them from the CleverTap dashboard under Settings > Project. If the Passcode isn't visible, an Admin can regenerate one from the same screen — regenerating invalidates the previous passcode, so pause any live integrations first. These are CleverTap's credentials, distinct from PiCommerce's own API keys (which live under PiCommerce Developer > APIs & Webhooks and are unrelated to any vendor connection).",
    sourceUrl: "https://developer.clevertap.com/docs/api-quickstart",
  },
  {
    vendor: "clevertap",
    vendorName: "CleverTap",
    section: "Pasting CleverTap credentials into PiCommerce",
    body: "Once you have Account ID + Passcode from CleverTap, come back to PiCommerce's Integrations page (this page), click Connect on the CleverTap card, paste them, and select your CleverTap data region (US, EU, India-1, Singapore, or Middle East). Save. PiCommerce runs a validation call against CleverTap's profile API — a green Connected badge means credentials and region are correct. Segment sync starts on the next hourly tick.",
  },
  {
    vendor: "clevertap",
    vendorName: "CleverTap",
    section: "Configure in PiCommerce",
    body: "On the Integrations page, click Connect on the CleverTap card. Enter the Account ID, Passcode, and select your data region (US, EU, India-1, Singapore, or Middle East). PiCommerce runs a validation call against CleverTap's profile API — a green Connected badge means credentials + region are correct. Segment sync starts on the next hourly tick.",
  },
  {
    vendor: "clevertap",
    vendorName: "CleverTap",
    section: "Test the integration",
    body: "After connecting, open Audience Builder and try to filter by a CleverTap segment name. If the dropdown lists your segments, the read path works. To test the write path, launch a small campaign to a test segment and confirm the event appears in CleverTap's Events view within a minute (Message Sent, Message Delivered, Message Read).",
  },
  {
    vendor: "clevertap",
    vendorName: "CleverTap",
    section: "Troubleshooting",
    body: "If segments do not appear, the most common cause is a region mismatch — an India-1 account with region set to US will authenticate but return zero segments. Reconnect with the correct region. If events are not landing back in CleverTap, check that the Event Streaming integration in CleverTap dashboard (Settings > Integrations) is enabled — some accounts have it off by default.",
  },

  // ────────────────────────────────────────────────────────────────────────
  // Shopify
  // ────────────────────────────────────────────────────────────────────────
  {
    vendor: "shopify",
    vendorName: "Shopify",
    section: "Overview",
    body: "The Shopify integration syncs orders, products, customers and cart events into PiCommerce. Cart-abandonment campaigns become one-click to author because the abandoned_checkout event is available as a campaign trigger. Order status updates flow into the run timeline so post-purchase journeys (delivery, review, cross-sell) can branch on real order state.",
    sourceUrl: "https://shopify.dev/docs/api/admin-rest",
  },
  {
    vendor: "shopify",
    vendorName: "Shopify",
    section: "Prerequisites",
    body: "You need a Shopify store on any paid plan (Basic and above — the free trial and Starter do not support custom apps). The user connecting must be a Store Owner or a Staff account with the Apps and channels permission. If your store is on Shopify Plus, use a Custom App; on standard plans, install the PiCommerce app from the Shopify App Store.",
  },
  {
    vendor: "shopify",
    vendorName: "Shopify",
    section: "Getting credentials from Shopify",
    body: "Standard Shopify stores don't need manual credentials — clicking Connect on the Shopify card in PiCommerce Integrations redirects you to Shopify to install the PiCommerce app, and Shopify handles the token exchange on its own. For Shopify Plus with a Custom App: in Shopify admin go to Settings > Apps and sales channels > Develop apps, create an app, grant scopes (read_orders, read_products, read_customers, read_checkouts), and copy the Admin API access token. That token is Shopify's credential, distinct from PiCommerce's own API keys (which live under PiCommerce Developer > APIs & Webhooks and are unrelated to any vendor connection).",
    sourceUrl: "https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens",
  },
  {
    vendor: "shopify",
    vendorName: "Shopify",
    section: "Configure in PiCommerce",
    body: "On the Integrations page click Connect on the Shopify card. Standard stores: enter your myshopify.com store URL and complete the Shopify OAuth prompt. Custom App stores: paste the store URL and the Admin API access token, then save. First sync backfills the last 30 days of orders and every current customer — takes 2-10 minutes depending on store size.",
  },
  {
    vendor: "shopify",
    vendorName: "Shopify",
    section: "Test the integration",
    body: "After the first sync completes, open Audience Builder — you should see Shopify traits (last_order_total, order_count, cart_value) in the trait picker. Trigger a test abandoned checkout in your store (add to cart, start checkout, close the tab) and confirm an abandoned_checkout event appears in the PiCommerce event stream within a minute.",
  },
  {
    vendor: "shopify",
    vendorName: "Shopify",
    section: "Troubleshooting",
    body: "If OAuth loops back to Shopify, the store user does not have Apps permission — grant it in Shopify Settings > Users. If events sync but orders do not, the app scopes are missing read_orders; reinstall the app to re-grant scopes. Rate limits on Shopify Basic (2 requests/sec) can slow the initial backfill for large catalogs; the sync retries transparently.",
  },
];

/** Public catalog id → name map, used by the system prompt to enumerate
 *  what's answerable without leaking the whole doc corpus into the prompt. */
export const VENDOR_CATALOG: Record<VendorId, string> = {
  picom_platform: "PiCommerce",
  paytm_pg: "Paytm Payment Gateway",
  clevertap: "CleverTap",
  shopify: "Shopify",
};
