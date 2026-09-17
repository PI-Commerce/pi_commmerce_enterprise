/**
 * Analytics hooks — thin client-side wrappers around the D1 server functions
 * in `src/lib/server-fns/analytics.ts`.
 *
 * Every widget on the Analytics surface (KPIs, funnel, Sankey volumes, Logs)
 * should read through one of these so the range picker + campaign / channel
 * filters reflow the whole page from a single D1 query.
 *
 * Design:
 *   - `useAnalyticsSummary(filter)` — one round-trip for KPIs + funnel +
 *     byStatus + byChannel. Re-runs when filter shape changes.
 *   - `useAnalyticsLeads(filter, page, pageSize)` — paginated rows for the
 *     Logs table.
 *   - `useD1RangeRatio(filter)` — the ratio of `range-filtered-count /
 *     unrestricted-count` for a base scope (same filter minus `from`/`to`).
 *     Drives the transitional `scaleRunToRange`: instead of a synthetic
 *     `days/30` factor, the run's node/edge volumes scale by real D1 counts.
 *     Falls back to `null` when D1 isn't bound (prod pre-provisioning) so
 *     the caller can degrade to the old synthetic ratio.
 *
 * All three hooks return `{ data, loading, error }` shapes so widgets can
 * skeleton-render or show fallbacks without conditional-hooks gymnastics.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getAnalyticsSummary,
  getAnalyticsLeads,
  type AnalyticsFilter,
  type AnalyticsSummary,
  type AnalyticsLead,
} from "@/lib/server-fns/analytics";

/** Stable JSON key for a filter — used to short-circuit repeated fetches. */
function filterKey(f: AnalyticsFilter): string {
  return JSON.stringify({
    c: f.campaignId ?? null,
    r: f.runId ?? null,
    ch: f.channel ?? null,
    s: f.stageNodeId ?? null,
    st: f.status ?? null,
    fr: f.from ?? null,
    to: f.to ?? null,
    q: f.q ?? null,
  });
}

export function useAnalyticsSummary(filter: AnalyticsFilter): {
  data: AnalyticsSummary | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = filterKey(filter);
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = await getAnalyticsSummary({ data: filter });
        if (cancelled) return;
        setData(r);
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, loading, error };
}

export function useAnalyticsLeads(
  filter: AnalyticsFilter,
  page: number,
  pageSize: number,
): {
  rows: AnalyticsLead[];
  total: number;
  loading: boolean;
  error: string | null;
} {
  const [rows, setRows] = useState<AnalyticsLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = filterKey(filter) + `|${page}|${pageSize}`;
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = await getAnalyticsLeads({ data: { filter, page, pageSize } });
        if (cancelled) return;
        setRows(r.rows);
        setTotal(r.total);
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { rows, total, loading, error };
}

/**
 * Real-data range ratio. Same base scope, once with the date window applied,
 * once without — the client divides to get the "how much of this run's lifetime
 * falls in the picker window" fraction.
 *
 * Returns `null` on error (D1 not bound / read failed) so the caller can fall
 * back to the synthetic `days/30` factor rather than dead-ending.
 */
export function useD1RangeRatio(filter: AnalyticsFilter): number | null {
  const baseFilter = useMemo<AnalyticsFilter>(() => {
    const { from: _from, to: _to, ...rest } = filter;
    void _from; void _to;
    return rest;
  }, [filter]);
  const scoped = useAnalyticsSummary(filter);
  const base = useAnalyticsSummary(baseFilter);
  if (!scoped.data || !base.data) return null;
  if (base.data.totalLeads === 0) return null;
  return scoped.data.totalLeads / base.data.totalLeads;
}
