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

export type VendorId = "paytm_pg" | "clevertap" | "shopify";

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
    section: "Getting API credentials",
    body: "Log in to the Paytm for Business dashboard, open Developer Settings > API Keys, and generate a Merchant ID (MID) and Merchant Key. There are separate credentials for Staging and Production — copy both. Never share the Merchant Key; treat it like a password. Rotate it if you suspect a leak from the same screen.",
    sourceUrl: "https://business.paytm.com/docs/pg/api-keys/",
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
    section: "Getting API credentials",
    body: "In the CleverTap dashboard, go to Settings > Project. Copy the Account ID and Passcode (also called the API Passcode, distinct from your login password). If Passcode is not visible, an Admin can regenerate one from the same screen — regenerating invalidates the previous passcode so pause any live integrations first.",
    sourceUrl: "https://developer.clevertap.com/docs/api-quickstart",
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
    section: "Getting API credentials",
    body: "For standard stores, click Connect on the PiCommerce Integrations page and you will be redirected to Shopify to install the app — no manual credentials. For Shopify Plus with a Custom App: in Shopify admin go to Settings > Apps and sales channels > Develop apps, create an app, grant scopes (read_orders, read_products, read_customers, read_checkouts), and copy the Admin API access token.",
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
  paytm_pg: "Paytm Payment Gateway",
  clevertap: "CleverTap",
  shopify: "Shopify",
};
