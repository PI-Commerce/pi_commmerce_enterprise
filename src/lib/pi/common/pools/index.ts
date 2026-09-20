/**
 * Shared pools — barrel + registration entry point.
 *
 * Importing this module registers ALL pools with the kernel. Surface
 * modules don't need to import individual pool files — they declare
 * `uses: ["pool-a", "pool-b"]` and the kernel resolves via the
 * registry.
 *
 * pi-llm.ts (the server-fn entry point) imports this once so pools are
 * registered before any surface module dispatches its first request.
 */
import "./analytics-reads";
import "./asset-reads";
