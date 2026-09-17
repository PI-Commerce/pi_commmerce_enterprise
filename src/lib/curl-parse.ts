/**
 * Tiny cURL-command parser used by the Tool editor's "Import from cURL" sheet.
 *
 * Handles the shapes people actually paste from Postman / Chrome / API docs:
 *  - `curl 'https://…'`  (single-quoted URL)
 *  - `curl "https://…"`  (double-quoted URL)
 *  - Bare URL with no quotes
 *  - `-X <METHOD>` / `--request <METHOD>`
 *  - `-H "K: V"` / `--header "K: V"` — repeatable
 *  - `--data-raw`, `-d`, `--data`, `--data-binary` — first one wins
 *  - `-u user:pass` / `--user user:pass` → surfaced as `basicAuth`
 *  - Backslash-newline continuations (`\\\n`) are collapsed before parsing
 *
 * Query params are pulled out of the URL after `?`. Templated path segments
 * (`/orders/{id}`) are left as-is so the editor can pick them up via its
 * existing path-key regex.
 *
 * This is deliberately regex-based — no shell tokenizer. It's not bullet-proof
 * for exotic quoting, but it covers the 99% pasted-from-devtools case.
 */

export type ParsedCurl = {
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  query: { key: string; value: string }[];
  body?: unknown;
  bodyRaw?: string;
  basicAuth?: { user: string; pass: string };
};

/** Public entry point. Throws `Error` on unparseable input (no `curl` prefix, no URL). */
export function parseCurl(input: string): ParsedCurl {
  const src = input.trim().replace(/\\\r?\n/g, " ");
  if (!/^curl\b/i.test(src)) throw new Error("Not a cURL command (missing 'curl' prefix)");

  const headers: { key: string; value: string }[] = [];
  let method = "";
  let bodyRaw: string | undefined;
  let basicAuth: { user: string; pass: string } | undefined;
  let url = "";

  // Iterate tokens from left to right. A tiny tokenizer respects single and
  // double quotes so `-H "Content-Type: application/json"` stays intact.
  const tokens = tokenize(src);
  // First token is always `curl`.
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-X" || t === "--request") { method = tokens[++i] ?? ""; continue; }
    if (t === "-H" || t === "--header") {
      const raw = tokens[++i] ?? "";
      const colon = raw.indexOf(":");
      if (colon > 0) headers.push({ key: raw.slice(0, colon).trim(), value: raw.slice(colon + 1).trim() });
      continue;
    }
    if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") {
      bodyRaw = bodyRaw ?? tokens[++i]; continue;
    }
    if (t === "-u" || t === "--user") {
      const raw = tokens[++i] ?? "";
      const idx = raw.indexOf(":");
      basicAuth = { user: idx >= 0 ? raw.slice(0, idx) : raw, pass: idx >= 0 ? raw.slice(idx + 1) : "" };
      continue;
    }
    if (t.startsWith("-")) continue; // unknown flag — skip its value best-effort
    if (!url) url = t; // first bare token is the URL
  }

  if (!url) throw new Error("No URL found in cURL command");

  // Extract query params from the URL.
  const query: { key: string; value: string }[] = [];
  let cleanUrl = url;
  const q = url.indexOf("?");
  if (q >= 0) {
    cleanUrl = url.slice(0, q);
    const qs = url.slice(q + 1);
    for (const pair of qs.split("&")) {
      if (!pair) continue;
      const [k, ...rest] = pair.split("=");
      query.push({ key: decodeURIComponent(k), value: decodeURIComponent(rest.join("=") ?? "") });
    }
  }

  // Method default: POST if there's a body, else GET.
  if (!method) method = bodyRaw ? "POST" : "GET";

  // If body parses as JSON, hand it back structured; otherwise keep raw.
  let body: unknown;
  if (bodyRaw) {
    try { body = JSON.parse(bodyRaw); }
    catch { body = undefined; }
  }

  return { method: method.toUpperCase(), url: cleanUrl, headers, query, body, bodyRaw, basicAuth };
}

/* --------------------------- tokenizer --------------------------- */

/**
 * Split a shell-style command into tokens, respecting single and double
 * quotes. Nested quoting isn't supported — good enough for pasted cURL.
 */
function tokenize(src: string): string[] {
  const out: string[] = [];
  let buf = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) { quote = null; continue; }
      buf += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c as '"' | "'"; continue; }
    if (/\s/.test(c)) {
      if (buf) { out.push(buf); buf = ""; }
      continue;
    }
    buf += c;
  }
  if (buf) out.push(buf);
  return out;
}
