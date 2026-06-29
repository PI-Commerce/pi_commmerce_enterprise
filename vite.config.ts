// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// @copilotkit/runtime pulls in pkce-challenge@5 (OAuth PKCE helper). Its package.json
// `exports` map only declares `browser`/`node` condition branches with no bare default,
// so rollup's resolver (which doesn't match either during the Cloudflare Worker/SSR build)
// errors with "No known conditions for '.' specifier". We never exercise PKCE — the live
// agent path uses the AnthropicAdapter directly, not CopilotCloud's OAuth flow — but we
// still alias the specifier straight to its concrete node ESM file so the bundle resolves.
const PKCE_NODE_ENTRY = fileURLToPath(
  new URL("./node_modules/pkce-challenge/dist/index.node.js", import.meta.url),
);

// Stub heavy *client-only* renderer deps in the SSR (Cloudflare Worker) build so they don't
// blow the 3 MiB free-plan worker-size limit. Each module here is never executed server-side:
//
//   - mermaid / elkjs / @mermaid-js/parser — GenUI C1 SDK (@thesysai/genui-sdk) draws these
//     client-only via PiGenUiResult; ~6.5 MiB raw of dead weight in the worker otherwise.
//   - streamdown — @copilotkit/react-core's streaming markdown renderer for chat messages.
//     It transitively pulls `shiki` + `@shikijs/langs` (~1.18 MiB gz of language packs) and
//     `@shikijs/themes` (~158 KiB gz). CopilotChat is gated by `state==="collapsed"` in
//     AgentComposer, so SSR's first render never enters that subtree — stubbing the
//     Streamdown entry shears the whole shiki tree off the worker bundle.
//   - react-syntax-highlighter (root + /dist/esm/styles/prism) — pulled by @copilotkit/react-ui
//     and @crayonai/react-ui's `CodeBlock` for prism-themed code highlighting. Same logic:
//     never reached by SSR; stubbing drops refractor / highlight.js / lowlight (~260 KiB gz).
//
// The client build (no stub) keeps the real modules — they ship as static-asset chunks under
// dist/client, which Cloudflare serves directly via the ASSETS binding (not subject to the
// 3 MiB worker limit). Three stub flavours, one per shape of named imports:
const EMPTY_STUB = "\0virtual:empty-ssr-stub";
const STREAMDOWN_STUB = "\0virtual:streamdown-ssr-stub";
const RSH_ROOT_STUB = "\0virtual:rsh-root-ssr-stub";
const RSH_STYLES_STUB = "\0virtual:rsh-styles-ssr-stub";
const COPILOT_RUNTIME_STUB = "\0virtual:copilot-runtime-ssr-stub";
const ANTHROPIC_STUB = "\0virtual:anthropic-ssr-stub";
// `reflect-metadata` is intentionally NOT stubbed — it's a polyfill side-effect import.
// `@ag-ui/{client,core}` and `@copilotkit/shared` are NOT stubbed either: they're pulled
// in by @copilotkit/react-core (the SSR-rendered provider) with many named imports, and
// trying to whack-a-mole them one name at a time breaks the build. Trim what's cleanly
// shearable; the rest is the cost of keeping the provider SSR-renderable.
const STUB_SSR_EMPTY = /^(mermaid|elkjs|@mermaid-js\/parser|@modelcontextprotocol\/sdk|google-auth-library|@copilotkit\/web-inspector)(\/|$)/;
const STUB_SSR_RSH_STYLES = /^react-syntax-highlighter\/dist\/esm\/styles\//;
const STUB_SSR_RSH_ROOT = /^react-syntax-highlighter(\/|$)/;
const STUB_SSR_STREAMDOWN = /^streamdown(\/|$)/;
const STUB_SSR_COPILOT_RUNTIME = /^@copilotkit\/runtime(\/|$)/;
const STUB_SSR_ANTHROPIC = /^@anthropic-ai\/sdk(\/|$)/;
function stubHeavyDepsInSsr() {
  return {
    name: "stub-genui-heavy-ssr",
    enforce: "pre" as const,
    resolveId(id: string, _importer: string | undefined, opts?: { ssr?: boolean }) {
      if (!opts?.ssr) return null;
      if (STUB_SSR_EMPTY.test(id)) return EMPTY_STUB;
      // Order matters: the more-specific /styles/ subpath must be checked BEFORE the
      // root regex, otherwise the root catch grabs it and the wrong named exports are
      // emitted (the styles files export theme objects, not components).
      if (STUB_SSR_RSH_STYLES.test(id)) return RSH_STYLES_STUB;
      if (STUB_SSR_RSH_ROOT.test(id)) return RSH_ROOT_STUB;
      if (STUB_SSR_STREAMDOWN.test(id)) return STREAMDOWN_STUB;
      if (STUB_SSR_COPILOT_RUNTIME.test(id)) return COPILOT_RUNTIME_STUB;
      if (STUB_SSR_ANTHROPIC.test(id)) return ANTHROPIC_STUB;
      return null;
    },
    load(id: string) {
      if (id === EMPTY_STUB) return "export default {};";
      if (id === STREAMDOWN_STUB) {
        // streamdown's only public export is the Streamdown React component.
        return [
          "const noop = () => null;",
          "export default noop;",
          "export const Streamdown = noop;",
        ].join("\n");
      }
      if (id === RSH_ROOT_STUB) {
        // react-syntax-highlighter root entry — Light/Prism are React components used by
        // @copilotkit/react-ui's MarkdownRenderer and @crayonai's CodeBlock; the rest are
        // documented public exports we include defensively.
        return [
          "const noop = () => null;",
          "export default noop;",
          "export const Light = noop;",
          "export const Prism = noop;",
          "export const PrismLight = noop;",
          "export const PrismAsync = noop;",
          "export const PrismAsyncLight = noop;",
          "export const createElement = noop;",
        ].join("\n");
      }
      if (id === COPILOT_RUNTIME_STUB) {
        // @copilotkit/runtime — server-only, reached only via the lazy `runtime.server.ts`
        // module that handles /api/copilotkit. Stubbed in SSR per the "offline-only deploy"
        // posture: in the deployed worker the chat path returns 503 (wizard mode still
        // works — that's the default and is fully offline). Local dev uses real modules.
        return [
          "const noop = () => null;",
          "class Noop { constructor(){} }",
          "export default Noop;",
          "export const AnthropicAdapter = Noop;",
          "export const CopilotRuntime = Noop;",
          "export const EmptyAdapter = Noop;",
          "export const copilotRuntimeNextJSAppRouterEndpoint = () => ({ handleRequest: noop, POST: noop });",
        ].join("\n");
      }
      if (id === ANTHROPIC_STUB) {
        // @anthropic-ai/sdk — server-only HTTP client for Anthropic; never used in SSR
        // render path. The default export is the Anthropic client class.
        return [
          "class Anthropic { constructor() {} }",
          "export default Anthropic;",
          "export { Anthropic };",
        ].join("\n");
      }
      if (id === RSH_STYLES_STUB) {
        // /dist/esm/styles/prism|hljs exports style objects (color rules). We only need
        // vscDarkPlus today (crayonai/CodeBlock); listing the common Prism/hljs theme
        // names here lets the stub keep working if other consumers grow imports.
        const themes = [
          "vscDarkPlus", "atomDark", "coldarkCold", "coldarkDark", "coy", "coyWithoutShadows",
          "darcula", "dracula", "duotoneDark", "duotoneEarth", "duotoneForest", "duotoneLight",
          "duotoneSea", "duotoneSpace", "ghcolors", "gruvboxDark", "gruvboxLight", "holiTheme",
          "hopscotch", "lucario", "materialDark", "materialLight", "materialOceanic", "nightOwl",
          "nord", "okaidia", "oneDark", "oneLight", "pojoaque", "prism", "shadesOfPurple",
          "solarizedDarkAtom", "solarizedlight", "synthwave84", "tomorrow", "twilight", "vs",
          "xonokai", "zTouch", "base16AteliersulphurpoolLight", "cb",
        ];
        return [
          "const empty = {};",
          "export default empty;",
          ...themes.map((t) => `export const ${t} = empty;`),
        ].join("\n");
      }
      return null;
    },
  };
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // Outside Lovable's sandbox the nitro deploy plugin is skipped, so `vite build`
  // emits only a generic SSR build and `wrangler deploy` can't bundle src/server.ts
  // (TanStack's #tanstack-* virtual modules don't exist at that point). Enabling
  // nitro here mirrors the sandbox preset and produces a deployable Cloudflare Worker.
  nitro: {
    preset: "cloudflare-module",
    output: { dir: "dist", serverDir: "dist/server", publicDir: "dist/client" },
    cloudflare: { nodeCompat: true, deployConfig: true },
  },
  vite: {
    plugins: [stubHeavyDepsInSsr()],
    resolve: {
      alias: [{ find: /^pkce-challenge$/, replacement: PKCE_NODE_ENTRY }],
    },
  },
});
