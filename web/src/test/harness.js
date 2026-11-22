// A real lab server (the repo's own Express app, in process, on a loopback port) for the UI tests: the page talks to the genuine engine, so a test that
// clicks "Check sign-in" sees the genuine outcome. Nothing leaves the machine: Mock makes no outbound call, and the Real object is an in-process fake
// whose `read` returns canned data (it never opens a socket).
import { createApp, startHttpServer } from "../../../server/src/app.js";
import { createHealth } from "../../../server/src/health.js";
import { createWorkspaces } from "../../../server/src/workspaces.js";
import { forgetWorkspace, workspaceId } from "../workspace.js";

export const REAL_HOST = "org-dev-ed.my.salesforce.example";
export const REAL_SNAPSHOT = {
  fetchedAt: "2026-11-22T10:00:00.000Z", host: REAL_HOST, readOnly: true, basis: "live", label: "read from your org, read-only",
  permissionSets: [{ id: "0PSxx0000000001", label: "Ledger Reader", name: "Ledger_Reader" }, { id: "0PSxx0000000002", label: "A label with a very very long name that goes on and on and on and on and on and on and on", name: "Long" }],
  users: [{ id: "005xx0000000001", username: "admin@org-dev-ed.example", email: "admin@org-dev-ed.example", name: "Pat Admin", active: true }, { id: "005xx0000000002", username: "gone@org-dev-ed.example", email: "gone@org-dev-ed.example", name: "Gone User", active: false }],
  hops: [{ label: "token", method: "POST", path: "/services/oauth2/token", status: 200, traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01" }], traceId: "0af7651916cd43dd8448eb211c80319c",
};
export const fakeReal = ({ failWith } = {}) => ({
  configured: true, reason: null, host: REAL_HOST, origin: `https://${REAL_HOST}`,
  read: async () => { if (failWith) throw failWith; return structuredClone(REAL_SNAPSHOT); },
});

// Starts the lab and points the page's fetch at it. `overrides` maps a path (no query) to a function (init) => Response, to force a 4xx/5xx.
export async function startLab({ real, overrides = {} } = {}) {
  const health = createHealth({ runChecks: async () => [], intervalMs: 3_600_000 });
  await health.ready;
  const env = {};
  const { server, url } = await startHttpServer({ port: 0, host: "127.0.0.1", app: createApp({ health, configFile: "/nonexistent/customer.config.json", workspaces: createWorkspaces(), env, ...(real ? { real } : {}) }) });
  const base = url.replace(/\/$/, "");
  const nativeFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = (input, init = {}) => {
    const u = new URL(typeof input === "string" ? input : input.url, base);
    const path = u.pathname;
    const body = init.body ? (() => { try { return JSON.parse(init.body); } catch { return init.body; } })() : undefined;
    calls.push({ method: init.method || "GET", path, search: u.search, body });
    if (overrides[path]) { const pass = () => nativeFetch(u, { ...init, headers: { origin: base, ...(init.headers || {}) } });
      const r = overrides[path](init, u, pass); if (r) return Promise.resolve(r); }
    return nativeFetch(u, { ...init, headers: { origin: base, ...(init.headers || {}) } });
  };
  forgetWorkspace();
  return {
    base, calls,
    ws: () => workspaceId(),
    // A request outside the page (seeding a world), in the page's own workspace.
    post: (path, payload) => nativeFetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-workspace": workspaceId() }, body: JSON.stringify(payload) }).then((r) => r.json()),
    seed: (id, upTo, vertical = "finance") => nativeFetch(`${base}/api/scenarios/${id}/run`, { method: "POST", headers: { "content-type": "application/json", origin: base, "x-workspace": workspaceId() }, body: JSON.stringify({ vertical, upTo }) }).then((r) => r.json()),
    stop: async () => { globalThis.fetch = nativeFetch; health.stop(); await new Promise((res) => server.close(res)); },
  };
}

export const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const DIAGRAM_FIXTURE = {
  title: "Connect and link (test fixture)", intro: "A fixture for the tests: the server serves the real diagram data.",
  nodes: [
    { id: "admin", label: "Org admin", kind: "you", x: 0, y: 160 },
    { id: "priv", label: "PingOne Privilege (mock)", kind: "gateway", x: 420, y: 160 },
    { id: "sf", label: "Salesforce org (mock)", kind: "upstream", x: 840, y: 160 },
  ],
  steps: [
    { from: "admin", to: "priv", label: "Add Application wizard", say: "The admin pastes the org URL." },
    { from: "priv", to: "sf", label: "JWT bearer sign-in", say: "Privilege signs in as one integration user." },
    { from: "sf", to: "priv", label: "users and permission sets", say: "Sync reads them." },
  ],
};
