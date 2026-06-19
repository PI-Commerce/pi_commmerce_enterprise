// Dev-only helper: query ClickHouse production via its HTTP MCP endpoint, mirroring the
// Python stdio proxy (init + tools/call on the SAME keep-alive connection, retried — the
// prod cluster has multiple pods with no sticky sessions, so both requests must land on
// the same pod via a reused TCP socket). Token from env CLICKHOUSE_PROD_TOKEN (full value,
// incl. "Bearer "). Never commit the token. Used to pull real numbers for the Thesys capture.
//
//   CLICKHOUSE_PROD_TOKEN="Bearer ..." node scripts/clickhouse-query.mjs list_databases
//   CLICKHOUSE_PROD_TOKEN="Bearer ..." node scripts/clickhouse-query.mjs list_tables observability
//   CLICKHOUSE_PROD_TOKEN="Bearer ..." node scripts/clickhouse-query.mjs query "SELECT 1"

import { Agent, setGlobalDispatcher } from "undici";

// Force a single pooled socket so init + tool call reuse the same TCP connection (sticky pod).
setGlobalDispatcher(new Agent({ connections: 1, pipelining: 0, keepAliveTimeout: 60_000 }));

const URL =
  process.env.CLICKHOUSE_PROD_URL ||
  "https://pi-observability.internal.ap-south-1.production.apps.pai.mypaytm.com/mcp";
const TOKEN = process.env.CLICKHOUSE_PROD_TOKEN;
if (!TOKEN) {
  console.error("Missing CLICKHOUSE_PROD_TOKEN env var (full value, including 'Bearer ').");
  process.exit(1);
}

const BASE_HEADERS = {
  Authorization: TOKEN,
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

function parseSse(text) {
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("data: ")) {
      const payload = JSON.parse(line.slice(6));
      const content = payload?.result?.content;
      if (Array.isArray(content) && content[0]?.text != null) return content[0].text;
      return JSON.stringify(payload);
    }
  }
  return text;
}

export async function callRemote(tool, args = {}, maxAttempts = 8) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const initResp = await fetch(URL, {
        method: "POST",
        headers: BASE_HEADERS,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "clickhouse_prod_mcp_proxy", version: "1.0" },
          },
        }),
      });
      const sessionId = initResp.headers.get("mcp-session-id");
      if (!sessionId) continue;

      const toolResp = await fetch(URL, {
        method: "POST",
        headers: { ...BASE_HEADERS, "mcp-session-id": sessionId },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: tool, arguments: args },
        }),
      });
      if (toolResp.status === 404) continue; // different pod — retry
      if (!toolResp.ok) throw new Error(`HTTP ${toolResp.status}: ${(await toolResp.text()).slice(0, 300)}`);
      return parseSse(await toolResp.text());
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err;
    }
  }
  throw new Error(`Failed to reach production MCP after ${maxAttempts} attempts`);
}

// CLI
const [, , cmd, ...rest] = process.argv;
if (cmd) {
  const toolMap = {
    list_databases: () => callRemote("list_databases", {}),
    list_tables: () => callRemote("list_tables", { database: rest[0] }),
    query: () => callRemote("run_select_query", { query: rest.join(" ") }),
  };
  const run = toolMap[cmd];
  if (!run) {
    console.error(`Unknown command "${cmd}". Use: list_databases | list_tables <db> | query <sql>`);
    process.exit(1);
  }
  run()
    .then((out) => console.log(out))
    .catch((err) => {
      console.error(String(err.message || err));
      process.exit(1);
    });
}
