// Thesys C1 render wrapper for the Ask Pi comparison spike. TanStack Start SSRs every
// route, but the Thesys SDK is browser-only — so we lazy-load the real render path and
// only mount it after hydration. Renders a captured DSL fixture entirely offline.
import { Suspense, lazy, useEffect, useState } from "react";

const PiThesysInner = lazy(() => import("./PiThesysInner"));

export function PiThesysResult({ c1Response }: { c1Response: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const placeholder = (
    <div className="flex h-[260px] w-full items-center justify-center text-[12px] text-muted-foreground">
      Loading Thesys renderer…
    </div>
  );

  if (!mounted) return placeholder;
  return (
    <Suspense fallback={placeholder}>
      <PiThesysInner c1Response={c1Response} />
    </Suspense>
  );
}
