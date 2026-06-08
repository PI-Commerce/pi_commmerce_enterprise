# PiCom Enterprise Demo

UI prototype for the PiCom Campaign Creation Service. Stack: TanStack Start (React 19) + Vite 7 + Tailwind 4 + shadcn/Radix UI, with ReactFlow for the campaign workflow canvas. Deployed to Cloudflare Workers.

> Note: this is a **UI prototype** built with mock/local data — there is no live backend.

## Prerequisites

- Node.js 20+
- The repo's lockfile is `bun.lock`, but `npm` works fine if you don't have bun. Use whichever you have installed.

## Setup

```bash
npm install          # or: bun install
```

## Develop

```bash
npm run dev          # starts the dev server on http://localhost:8080
```

## Build

```bash
npm run build        # vite build → emits the Cloudflare Worker bundle into dist/
npm run preview      # serve the production build locally
```

## Deploy (Cloudflare Workers)

Live URL: https://picom-enterprise-demo.mayan-kansal.workers.dev

```bash
npm run build
npx wrangler deploy   # publishes from dist/ (config in wrangler.jsonc + generated dist/server/wrangler.json)
```

`wrangler deploy` is run from the repo root; it auto-follows the redirect that the build writes to `.wrangler/deploy/config.json`. First-time deployers must run `npx wrangler login` once (interactive browser OAuth).

## Project layout

- `src/routes/` — TanStack Router file-based routes
- `src/components/workflow/` — campaign builder canvas (`WorkflowCanvas.tsx`, `nodes.tsx`, `ConfigPanel`)
- `src/components/ui/` — shadcn UI primitives
- `wrangler.jsonc` / `vite.config.ts` — deploy + build config (see comments before editing)

## Notes for corporate networks

If `npm install` / `wrangler` fail with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` behind a TLS-intercepting proxy, export your machine's root certs to a PEM and point `NODE_EXTRA_CA_CERTS` at it. Do **not** set `NODE_TLS_REJECT_UNAUTHORIZED=0`.
