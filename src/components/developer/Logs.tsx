/**
 * Developer > Logs.
 *
 * Placeholder for the API-logs surface. Real implementation will show a
 * paginated, filterable table of inbound API calls with per-request details:
 * timestamp, key, endpoint, status, latency, request/response bodies.
 */

import { ScrollText } from "lucide-react";

export function DeveloperLogs() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
      <ScrollText className="mx-auto h-6 w-6 text-muted-foreground" />
      <h3 className="mt-3 text-[14px] font-semibold">Logs are coming</h3>
      <p className="mx-auto mt-1.5 max-w-md text-[12.5px] text-muted-foreground">
        Every inbound API call, filterable by key, endpoint, status and time. Inspect
        the request and response bodies without leaving the dashboard.
      </p>
    </div>
  );
}
