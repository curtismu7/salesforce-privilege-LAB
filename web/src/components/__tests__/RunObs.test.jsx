import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RunObs, { headOf } from "../RunObs.jsx";
import { setJsonView } from "../JsonPane.jsx";
import { mockRecord } from "../../run-observability/fixtures.js";

// The lab's wrapper around the shared panel: which run is asked for, what is shown while it loads, and what every non-record answer comes to.
// The shared panel has its own tests in web/src/run-observability/.
beforeEach(() => setJsonView("raw"));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const recordOf = (runId, text) => ({ ...mockRecord, runId, rows: mockRecord.rows.map((r) => (r.layer === "privilege" ? { ...r, message: text } : r)) });
// A fetch that answers by URL.
const reply = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });
function serve(routes) {
  globalThis.fetch = vi.fn(async (url) => {
    const h = routes[String(url)];
    if (!h) return reply({ message: `no route ${url}` }, { ok: false, status: 404 });
    return typeof h === "function" ? h() : h;
  });
}
const url = (id) => `/api/actions/run?runId=${id}`;
const fetched = () => globalThis.fetch.mock.calls.map(([u]) => String(u));

describe("what the server said about a run (headOf)", () => {
  it("reads the run id, or the note that no run began", () => {
    expect(headOf({ run: { id: "act-abc123-1" } })).toEqual({ runId: "act-abc123-1" });
    expect(headOf({ run: null, runNote: "began none" })).toEqual({ none: "began none" });
    expect(headOf({ run: null })).toEqual({ none: expect.stringMatching(/began no run/) });
    expect(headOf({ run: null, runNote: "" })).toEqual({ none: expect.stringMatching(/began no run/) });
  });
  it.each([
    ["undefined", undefined], ["null", null], ["an array", []], ["a JSON string", "ok"], ["an empty object", {}], ["a run that is undefined", { run: undefined }],
    ["a run with no id", { run: {} }], ["a run with an empty id", { run: { id: "" } }], ["a run id that is a number", { run: { id: 5 } }], ["a run that is text", { run: "x" }], ["an error answer with no run field", { error: "server_error" }],
  ])("%s does not say which run it was: the client never guesses", (_name, d) => { expect(headOf(d)).toEqual({ bad: true }); });
});

describe("the states around the panel", () => {
  it("nothing yet: the empty text, and nothing is fetched", () => {
    serve({});
    render(<RunObs head={undefined} empty="Nothing has run yet." />);
    expect(screen.getByTestId("ro-empty")).toHaveTextContent("Nothing has run yet.");
    expect(fetched()).toHaveLength(0);
  });
  it("an answer that said no run began: its note, no panel, nothing fetched (and no older record)", () => {
    serve({});
    render(<RunObs head={{ none: "This request began no run, so nothing was recorded." }} />);
    expect(screen.getByTestId("ro-no-run")).toHaveTextContent(/began no run/);
    expect(screen.queryByTestId("ro-wrap")).toBeNull();
    expect(fetched()).toHaveLength(0);
  });
  it("a run id: the record route is asked once with that id, and the panel shows its record", async () => {
    serve({ [url("act-abc123-1")]: reply({ record: recordOf("act-abc123-1", "The mock Privilege policy granted it.") }) });
    render(<RunObs head={{ runId: "act-abc123-1" }} />);
    await waitFor(() => expect(screen.getByTestId("ro-wrap")).toBeTruthy());
    expect(fetched()).toEqual([url("act-abc123-1")]);
    expect(screen.getByTestId("ro-lab-note")).toHaveTextContent(/Only a grant or a revoke/);
  });
  it("the on-page note: a user not linked yet is a stop that began no run, never a refused Privilege row", async () => {
    serve({ [url("act-abc123-1")]: reply({ record: recordOf("act-abc123-1", "The mock Privilege policy granted it.") }) });
    render(<RunObs head={{ runId: "act-abc123-1" }} />);
    await waitFor(() => expect(screen.getByTestId("ro-wrap")).toBeTruthy());
    const note = screen.getByTestId("ro-lab-note").textContent;
    expect(note).not.toMatch(/a user not linked,/, "the refusals list must not name a user not linked");
    expect(note).toMatch(/began no run \(a user not linked yet,/, "the no-run list names a user not linked yet");
  });
  it("the on-page note names the four refusals the policy makes, and the panel's stdout text says one line per recorded row", async () => {
    serve({ [url("act-abc123-1")]: reply({ record: recordOf("act-abc123-1", "The mock Privilege policy granted it.") }) });
    render(<RunObs head={{ runId: "act-abc123-1" }} />);
    await waitFor(() => expect(screen.getByTestId("ro-wrap")).toBeTruthy());
    const note = screen.getByTestId("ro-lab-note").textContent;
    expect(note).toMatch(/the permission set is already held/);
    expect(note).toMatch(/needs a licence the user does not hold/);
    expect(note).toMatch(/the licence does not match/);
    expect(note).toMatch(/the policy is not active/);
    const body = document.body.textContent;
    expect(body).not.toMatch(/one line per policy-point decision/);
    expect(body).toMatch(/result=unclear/, "a non-policy action writes a line marked unclear");
  });
  it("an answer that is not a record (a proxy's HTML page): an alert, never an empty panel, and the previous record is not shown", async () => {
    serve({ [url("act-abc123-1")]: reply({ error: "bad_response" }, { ok: false, status: 502 }) });
    render(<RunObs head={{ runId: "act-abc123-1" }} />);
    await waitFor(() => expect(screen.getByTestId("ro-problem")).toBeTruthy());
    expect(screen.getByTestId("ro-problem")).toHaveTextContent(/502/);
    expect(screen.queryByTestId("ro-wrap")).toBeNull();
  });
  it("a record the lab no longer keeps: the note, not an empty table", async () => {
    serve({ [url("act-abc123-1")]: reply({ record: null, message: "That run is no longer kept." }) });
    render(<RunObs head={{ runId: "act-abc123-1" }} />);
    await waitFor(() => expect(screen.getByTestId("ro-gone")).toBeTruthy());
    expect(screen.getByTestId("ro-gone")).toHaveTextContent(/no longer kept/);
  });
  it("a new run asks again; the loading state never shows the previous record", async () => {
    let resolve2;
    serve({
      [url("act-abc123-1")]: reply({ record: recordOf("act-abc123-1", "first run") }),
      [url("act-abc123-2")]: () => new Promise((res) => { resolve2 = res; }),
    });
    const { rerender } = render(<RunObs head={{ runId: "act-abc123-1" }} />);
    await waitFor(() => expect(screen.getByTestId("ro-wrap")).toBeTruthy());
    rerender(<RunObs head={{ runId: "act-abc123-2" }} />);
    expect(screen.getByTestId("ro-loading")).toBeTruthy();
    expect(screen.queryByTestId("ro-wrap")).toBeNull();
    resolve2(reply({ record: recordOf("act-abc123-2", "second run") }));
    await waitFor(() => expect(screen.getByTestId("ro-wrap")).toBeTruthy());
    expect(fetched()).toEqual([url("act-abc123-1"), url("act-abc123-2")]);
  });
});
