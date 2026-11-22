import { workspaceFetch } from "./workspace";

export async function getJson(url) {
  const r = await workspaceFetch(url, { method: "GET" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// POST or PUT JSON. Returns { ok, status, body }: a refusal (400, 403, 409) is data (a code and a detail), not an exception.
const UNREACHABLE = { ok: false, status: 0, body: { error: "unreachable", message: "The lab server did not answer. Is it running?" } };
export async function sendJson(method, url, payload) {
  let r;
  try { r = await workspaceFetch(url, { method, body: JSON.stringify(payload) }); } catch { return UNREACHABLE; } // never an exception: the toggle must always say what happened
  let body = {};
  try { body = await r.json(); } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, body };
}
export const postJson = (url, payload) => sendJson("POST", url, payload);
export const putJson = (url, payload) => sendJson("PUT", url, payload);

export const resetWorkspace = () => workspaceFetch("/api/reset", { method: "POST", body: "{}" }).then((r) => r.ok);

// Rule 19: the server-side Mock/Real toggle. Returns { ok, status, body } and never throws on 409.
export const getModeInfo = async () => {
  let r;
  try { r = await workspaceFetch("/api/mode", { method: "GET" }); } catch { return UNREACHABLE; }
  let body = {};
  try { body = await r.json(); } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, body };
};
export const setMode = (source) => sendJson("POST", "/api/mode", { source });

// ---- this lab's calls -------------------------------------------------------------------------------------------------------------------------
// A body that is not JSON (a proxy's 502 page) becomes { error, message } so the page always has a sentence to show.
const asBody = (r, body) => (body && typeof body === "object" ? body : { error: "bad_response", message: `The lab answered HTTP ${r.status} without a JSON body` });
async function call(method, url, payload) {
  let r;
  try { r = await workspaceFetch(url, { method, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) }); } catch { return { ok: false, status: 0, body: { error: "unreachable", message: "The lab server did not answer. Is it running?" } }; }
  let body = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, body: asBody(r, body) };
}
export const getState = (vertical) => call("GET", `/api/state?vertical=${encodeURIComponent(vertical)}`);
export const getInfo = () => call("GET", "/api/info");
export const getStory = (vertical) => call("GET", `/api/story?vertical=${encodeURIComponent(vertical)}`);
export const getDiagram = (name, vertical) => call("GET", `/api/diagram?name=${encodeURIComponent(name)}&vertical=${encodeURIComponent(vertical)}`);
// The one write endpoint. A refusal the visitor asked for comes back as data (refusalsAs200); a 5xx keeps its status.
export const postAction = (op, params, vertical) => call("POST", "/api/actions", { op, params: params || {}, vertical, refusalsAs200: true });
export const postScenario = (id, vertical, upTo) => call("POST", `/api/scenarios/${encodeURIComponent(id)}/run`, { vertical, ...(upTo === undefined ? {} : { upTo }) });
export const postRealRead = (confirm) => call("POST", "/api/real/read", { confirm });
export const postReset = () => call("POST", "/api/reset", {});
