import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Provider Console layout.
 *
 * In production everything under `/admin` is a separate deploy on an internal
 * subdomain, gated by Google SSO plus a Workspace-group allowlist. Here it is a
 * route segment so the mock can be demoed from one bundle — the plane check
 * lives in {@link file://../components/admin/ProviderPage.tsx}.
 */
export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  return <Outlet />;
}
