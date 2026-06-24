// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The GenUI C1 SDK (@thesysai/genui-sdk) pulls in mermaid + elkjs + @mermaid-js/parser
// (~6.5MB). The GenUI renderer mounts client-only (see PiGenUiResult), so the server never
// executes it — yet rollup still bundles those deps into the Cloudflare Worker, blowing the
// 3 MiB worker-size limit. Stub them to empty modules in the SSR build ONLY; the client build
// keeps the real ones as static-asset chunks (not subject to the worker limit).
const STUB_SSR = /^(mermaid|elkjs|@mermaid-js\/parser)(\/|$)/;
const EMPTY_STUB = "\0virtual:empty-ssr-stub";
function stubHeavyDepsInSsr() {
  return {
    name: "stub-genui-heavy-ssr",
    enforce: "pre" as const,
    resolveId(id: string, _importer: string | undefined, opts?: { ssr?: boolean }) {
      if (opts?.ssr && STUB_SSR.test(id)) return EMPTY_STUB;
      return null;
    },
    load(id: string) {
      if (id === EMPTY_STUB) return "export default {};";
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
  },
});
