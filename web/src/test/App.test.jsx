import { describe, expect, it } from "vitest";
import { fireEvent } from "@testing-library/react";
import { REAL_HOST, fakeReal, jsonResponse } from "./harness.js";
import { LABEL_TEXT, nav, screen, text, useLabHarness, userEvent, waitFor, within } from "./util.jsx";
import { MODE_LINES } from "../App.jsx";

const h = useLabHarness();
const PAGES = ["Support P1", "Scenarios", "Connect", "Link", "Grant and revoke", "Diagram", "Real"];
const BANNER = "Simulated: every behaviour shown was recorded in one real Privilege and Salesforce run.";

describe("shell: Real-or-mock modal, header, presenter, talk track", () => {
  it("opens on the MOCK modal with the old banner's sentence, Got it closes it, and no banner is on any page", async () => {
    const user = await h.mount();
    const modal = await screen.findByTestId("mode-modal");
    expect(modal).toHaveAttribute("data-mode", "mock");
    expect(modal.textContent).toBe(`MOCK${BANNER}Got it`);
    expect(MODE_LINES.mock).toBe(BANNER);
    await user.click(screen.getByTestId("mode-modal-ok"));
    expect(screen.queryByTestId("mode-modal")).toBeNull();
    for (const p of PAGES) {
      await nav(user, p);
      expect(screen.queryByTestId("banner"), p).toBeNull();
      expect(document.querySelector("main > .banner"), p).toBeNull();
      expect(screen.queryByTestId("mode-modal"), p).toBeNull(); // dismissed once for the session
    }
  });

  it("stays off until the mode is known (the lab can start in Real, so MOCK is never guessed), then says REAL for a configured Real lab", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    await h.mount({ real: fakeReal(), loaded: false, overrides: { "/api/info": (init, u, pass) => gate.then(pass) } });
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.queryByTestId("mode-modal")).toBeNull(); // /api/info is held
    release();
    const modal = await screen.findByTestId("mode-modal");
    expect(modal).toHaveAttribute("data-mode", "real");
    expect(modal).toHaveTextContent(/^REAL/);
    expect(modal.textContent).toContain(MODE_LINES.real);
  });

  it("the modal dismissed for Mock comes back as REAL when the visitor switches to Real, and a reload in the same session shows nothing", async () => {
    const user = await h.mount({ real: fakeReal() });
    expect((await screen.findByTestId("mode-modal")).getAttribute("data-mode")).toBe("real");
    await user.click(screen.getByTestId("mode-modal-ok"));
    await user.click(screen.getByTestId("mode-mock"));
    await waitFor(() => expect(screen.getByTestId("mode-modal")).toHaveAttribute("data-mode", "mock"));
    await user.click(screen.getByTestId("mode-modal-ok"));
    await user.click(screen.getByTestId("mode-real"));
    await waitFor(() => expect(pressed("mode-real")).toBe("true"));
    expect(screen.queryByTestId("mode-modal")).toBeNull(); // REAL was already dismissed in this session
  });

  it("keeps no banner in presenter mode and shows the talk-track lines for the page", async () => {
    const user = await h.mount();
    await nav(user, "Link");
    await user.click(screen.getByTestId("presenter"));
    expect(screen.queryByTestId("banner")).toBeNull();
    expect(screen.getByTestId("presenter-say")).toHaveTextContent(/email is the key/i);
    expect(screen.getByTestId("presenter")).toHaveAttribute("aria-pressed", "true");
    // the key P toggles and Escape leaves
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("presenter-say")).toBeNull());
    fireEvent.keyDown(window, { key: "p" });
    expect(screen.getByTestId("presenter")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("banner")).toBeNull();
  });

  it("presenter mode on the Support P1 page says the line for the beat the world is in, and moves on with the story", async () => {
    const user = await h.mount();
    await waitFor(() => expect(screen.getByTestId("beat-1")).toHaveAttribute("aria-current", "step"));
    await user.click(screen.getByTestId("presenter"));
    const box = await screen.findByTestId("presenter-say");
    expect(within(box).getByTestId("presenter-beat")).toHaveTextContent("Beat 1 of 3: No access");
    expect(box).toHaveTextContent(/You don't have access to Cases/);
    await user.type(screen.getByTestId("support-note"), "P1 note");
    await user.click(screen.getByTestId("support-request"));
    await waitFor(() => expect(screen.getByTestId("presenter-beat")).toHaveTextContent("Beat 2 of 3: Access for the job"));
    expect(screen.getByTestId("presenter-say")).toHaveTextContent(/Case Read Access/);
    expect(screen.getByTestId("presenter-say")).toHaveTextContent(/Revoke pending, access still live.*press Refresh receipts/s);
    await user.click(screen.getByTestId("support-end-access"));
    await waitFor(() => expect(text("support-policy-status")).toBe("Revoke pending, access still live"));
    expect(screen.getByTestId("presenter-beat")).toHaveTextContent("Beat 2 of 3"); // pending is still beat 2: the narration says to press Refresh receipts
    await user.click(screen.getByTestId("support-refresh"));
    await waitFor(() => expect(screen.getByTestId("presenter-beat")).toHaveTextContent("Beat 3 of 3: No access again, and a receipt"));
    expect(screen.getByTestId("presenter-say")).toHaveTextContent(/After Refresh receipts the assignment is gone/);
  });

  it("opens the shared talk-track dialog with every step of the script", async () => {
    const user = await h.mount();
    await user.click(screen.getByTestId("talk-track-toggle"));
    const dlg = await screen.findByTestId("talk-track-dialog");
    expect(within(dlg).getAllByRole("heading", { level: 2 }).length).toBeGreaterThanOrEqual(6);
    expect(dlg).toHaveTextContent(/Beat 1: no access/);
    expect(dlg).toHaveTextContent(/Beat 3: no access again, and a receipt/);
    expect(dlg).not.toHaveTextContent(/Drift|reaper/); expect(dlg.textContent).not.toMatch(LABEL_TEXT);
  });

  it("has a header with the shared TopMenu: mode, vertical, theme, text size, Reset", async () => {
    await h.mount();
    for (const id of ["mode-toggle", "vertical-select", "theme-select", "font-select", "reset", "presenter"]) expect(screen.getByTestId(id), id).toBeInTheDocument();
    expect(screen.getByTestId("mode")).toHaveTextContent("Mock");
  });

  it("a fresh load is the airlines vertical: AirGuard Airlines on Connect, no earlier brand anywhere on the page", async () => {
    const user = await h.mount();
    expect(screen.getByTestId("vertical-select")).toHaveValue("airlines");
    await nav(user, "Connect");
    await waitFor(() => expect(document.querySelector("main").textContent).toContain("AirGuard Airlines Privilege"));
    expect(document.body.textContent).not.toMatch(/Fabrikam|Contoso|Northwind|Meridian|Skyline|Harbor|Vellum/);
  });

  it("switches the vertical pack and the cast follows", async () => {
    const user = await h.mount();
    await nav(user, "Link");
    expect(await screen.findByTestId("pu-pu-a")).toHaveTextContent("Emma Hartley");
    await user.selectOptions(screen.getByTestId("vertical-select"), "health");
    await waitFor(() => expect(screen.getByTestId("pu-pu-a")).not.toHaveTextContent("Emma Hartley"));
  });

  it("Reset puts the world back to the start", async () => {
    const user = await h.mount({ seed: ["happy-path", 12] });
    await nav(user, "Connect");
    await waitFor(() => expect(screen.getByTestId("checklist")).toHaveTextContent("6 of 6"));
    await user.click(screen.getByTestId("reset"));
    await waitFor(() => expect(screen.getByTestId("checklist")).toHaveTextContent("0 of 6"));
    expect(h.lab.calls.some((c) => c.path === "/api/reset" && c.method === "POST")).toBe(true);
  });
});

const pressed = (id) => screen.getByTestId(id).getAttribute("aria-pressed");

describe("rule 19: the Mock / Real toggle", () => {
  it("is two buttons in the header of every page, the current mode pressed", async () => {
    const user = await h.mount();
    for (const p of PAGES) {
      await nav(user, p);
      const t = screen.getByTestId("mode-toggle");
      expect(t.closest("header"), p).not.toBeNull();
      expect(within(t).getAllByRole("button").map((b) => b.textContent), p).toEqual(["Mock", "Real"]);
      expect(pressed("mode-mock"), p).toBe("true");
      expect(pressed("mode-real"), p).toBe("false");
    }
  });

  it("Real not configured: the button is disabled with the how-to as its tooltip, and Real stays unpressed", async () => {
    const user = await h.mount();
    const real = screen.getByTestId("mode-real");
    expect(real).toBeDisabled();
    expect(real.getAttribute("title")).toMatch(/Real is not configured: set SF_LOGIN_URL/);
    await user.click(real); // a disabled button does nothing
    expect(h.lab.calls.filter((c) => c.path === "/api/mode" && c.method === "POST")).toHaveLength(0);
    await nav(user, "Real");
    expect(screen.getByTestId("real-howto")).toHaveTextContent(/\.env/);
  });

  it("the server answers 409 when Real is not configured, and the page shows that message (the page thought Real was available)", async () => {
    const lie = async (init, u, pass) => { const r = await pass(); const body = await r.json(); return jsonResponse(200, { ...body, realAvailable: true }); };
    const user = await h.mount({ overrides: { "/api/info": lie } });
    expect(screen.getByTestId("mode-real")).not.toBeDisabled();
    await user.click(screen.getByTestId("mode-real"));
    await waitFor(() => expect(screen.getByTestId("mode-error-banner")).toHaveTextContent(/Real is not configured: set SF_LOGIN_URL/));
    const post = h.lab.calls.filter((c) => c.path === "/api/mode" && c.method === "POST");
    expect(post.at(-1).body).toEqual({ source: "real" }); // exactly {source}
    expect(pressed("mode-mock")).toBe("true");
    expect(screen.getByTestId("mode")).toHaveTextContent("Mock");
  });

  it("a 409 from POST /api/mode is shown even when Real is configured, and the control stays on Mock", async () => {
    const refuse = (init) => (init.method === "POST" && JSON.parse(init.body).source === "real" ? jsonResponse(409, { error: "real_not_available", message: "Real is not configured (server said so)" }) : null);
    const user = await h.mount({ real: fakeReal(), overrides: { "/api/mode": refuse } });
    await user.click(screen.getByTestId("mode-mock"));
    await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("Mock"));
    await user.click(screen.getByTestId("mode-real"));
    await waitFor(() => expect(screen.getByTestId("mode-error-banner")).toHaveTextContent("Real is not configured (server said so)"));
    expect(pressed("mode-mock")).toBe("true");
    expect(screen.getByTestId("mode")).toHaveTextContent("Mock");
  });

  it("follows the server (default Real when configured), then switches Mock and Real both ways, reloading info, story and state each time", async () => {
    const user = await h.mount({ real: fakeReal() });
    expect(pressed("mode-real")).toBe("true");
    expect(screen.getByTestId("mode-modal")).toHaveAttribute("data-mode", "real");
    expect(text("mode-modal")).toMatch(/^REALRead-only, owner-run/);
    const before = h.lab.calls.length;
    await user.click(screen.getByTestId("mode-mock"));
    await waitFor(() => expect(pressed("mode-mock")).toBe("true"));
    expect(pressed("mode-real")).toBe("false");
    await waitFor(() => expect(screen.getByTestId("mode-modal")).toHaveAttribute("data-mode", "mock")); // the mode changed: MOCK shows
    expect(text("mode-modal")).toBe(`MOCK${BANNER}Got it`);
    let after = h.lab.calls.slice(before);
    expect(after.find((c) => c.path === "/api/mode" && c.method === "POST").body).toEqual({ source: "mock" });
    for (const p of ["/api/info", "/api/story", "/api/state"]) expect(after.some((c) => c.path === p), p).toBe(true);
    expect(screen.getByTestId("mode")).toHaveTextContent("Mock");
    const mark = h.lab.calls.length;
    await user.click(screen.getByTestId("mode-real"));
    await waitFor(() => expect(pressed("mode-real")).toBe("true"));
    expect(pressed("mode-mock")).toBe("false");
    after = h.lab.calls.slice(mark);
    expect(after.find((c) => c.path === "/api/mode" && c.method === "POST").body).toEqual({ source: "real" });
    for (const p of ["/api/info", "/api/story", "/api/state"]) expect(after.some((c) => c.path === p), p).toBe(true);
    await waitFor(() => expect(screen.getByTestId("mode-modal")).toHaveAttribute("data-mode", "real"));
    expect(screen.getByTestId("mode")).toHaveTextContent("Real");
  });

  it("in Real the acting pages say Real only reads (no empty tables), and the Real page offers the confirm gate", async () => {
    const user = await h.mount({ real: fakeReal() });
    for (const p of ["Connect", "Link", "Grant and revoke"]) {
      await nav(user, p);
      expect(screen.getByTestId("real-readonly"), p).toHaveTextContent(/Real only reads/);
    }
    await nav(user, "Support P1");
    expect(screen.getByTestId("real-readonly")).toHaveTextContent(/Real only reads/);
    await nav(user, "Scenarios");
    expect(screen.getByTestId("story-real")).toBeInTheDocument();
    await nav(user, "Real");
    expect(screen.getByTestId("real-read-btn")).toBeDisabled(); // nothing typed
    expect(screen.getByTestId("real-empty")).toBeInTheDocument();
  });

  it("the confirm gate: a wrong host is refused with the server's sentence, the right host reads once and shows the read-only list", async () => {
    const user = await h.mount({ real: fakeReal(), page: "real" });
    await user.type(screen.getByTestId("confirm-host"), "wrong.example");
    await user.click(screen.getByTestId("real-read-btn"));
    expect(await screen.findByTestId("real-error")).toHaveTextContent(new RegExp(`Type the org host \\(${REAL_HOST.replace(/\./g, "\\.")}\\)`));
    expect(screen.queryByTestId("real-result")).toBeNull();
    await user.clear(screen.getByTestId("confirm-host"));
    await user.type(screen.getByTestId("confirm-host"), REAL_HOST);
    await user.click(screen.getByTestId("real-read-btn"));
    const res = await screen.findByTestId("real-result");
    expect(res).toHaveTextContent("read-only");
    expect(res).toHaveTextContent("Ledger Reader");
    expect(res).toHaveTextContent("Gone User");
    expect(res).toHaveTextContent("inactive");
    expect(res).toHaveTextContent(/2 permission sets, 2 users/);
    expect(h.lab.calls.filter((c) => c.path === "/api/real/read").map((c) => c.body)).toEqual([{ confirm: "wrong.example" }, { confirm: REAL_HOST }]);
  });

  it("a downstream failure of the read is named, never blank", async () => {
    const { InputError } = await import("../../../server/src/errors.js");
    const fail = new InputError("salesforce_timeout", "Salesforce did not answer within 10 seconds", 504);
    const user = await h.mount({ real: fakeReal({ failWith: fail }), page: "real" });
    await user.type(screen.getByTestId("confirm-host"), REAL_HOST);
    await user.click(screen.getByTestId("real-read-btn"));
    expect(await screen.findByTestId("real-error")).toHaveTextContent(/Salesforce did not answer within 10 seconds/);
  });
});

describe("failure states", () => {
  it("a server error on load is named, with a retry that loads the lab", async () => {
    let broken = true;
    const user = await h.mount({ loaded: false, overrides: { "/api/state": () => (broken ? jsonResponse(500, { error: "internal_error", message: "The lab hit an unexpected error; nothing was changed" }) : null) } });
    const box = await screen.findByTestId("load-error");
    expect(box).toHaveTextContent(/Could not load the lab \(The lab hit an unexpected error; nothing was changed\)/);
    expect(screen.queryByTestId("banner")).toBeNull();
    expect(screen.queryByText("REAL")).toBeNull(); // the modal never guesses Real after a failed load
    broken = false;
    await user.click(screen.getByTestId("retry"));
    await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("Mock"));
    expect(screen.queryByTestId("load-error")).toBeNull();
  });

  it("a non-JSON proxy answer (HTML 502) is still a sentence, not a blank page", async () => {
    await h.mount({ loaded: false, overrides: { "/api/story": () => new Response("<html>Bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }) } });
    expect(await screen.findByTestId("load-error")).toHaveTextContent(/HTTP 502/);
  });

  it("an unreachable server is named", async () => {
    await h.mount({ loaded: false, overrides: { "/api/info": () => { throw new TypeError("fetch failed"); } } });
    expect(await screen.findByTestId("load-error")).toHaveTextContent(/did not answer/);
  });
});

describe("fix pass: no label chips anywhere and a toggle that is never silent", () => {
  it("a Real read says it is read-only and carries no label chip", async () => {
    const user = await h.mount({ real: fakeReal(), page: "real" });
    await user.type(screen.getByTestId("confirm-host"), REAL_HOST);
    await user.click(screen.getByTestId("real-read-btn"));
    const note = await screen.findByTestId("real-read-note");
    expect(note).toHaveTextContent(/read-only/);
    expect(note.textContent).not.toMatch(LABEL_TEXT);
  });

  it("pressing a mode button with the lab server down says so (modeError), never silently", async () => {
    const down = (init) => { if (init.method === "POST") throw new TypeError("Failed to fetch"); return null; };
    const user = await h.mount({ real: fakeReal(), overrides: { "/api/mode": down } });
    await user.click(screen.getByTestId("mode-mock"));
    await waitFor(() => expect(screen.getByTestId("mode-error-banner")).toHaveTextContent("The lab server did not answer. Is it running?"));
    expect(pressed("mode-real")).toBe("true"); // nothing changed
  });

  it("the Support P1 intro is shown only on the Support P1 page; every other page has its own one line (or none)", async () => {
    const user = await h.mount();
    const support = text("head-intro");
    expect(support).toMatch(/^Support P1: a support engineer starts with no access/);
    for (const p of ["Scenarios", "Connect", "Link", "Grant and revoke", "Diagram"]) {
      await nav(user, p);
      const intro = text("head-intro");
      expect(intro, p).not.toBe(support); expect(intro, p).not.toMatch(/Support P1: a support engineer/); expect(intro.split(". ").length, p).toBeLessThanOrEqual(2);
    }
    await nav(user, "Real");
    expect(screen.queryByTestId("head-intro")).toBeNull();
  });

  it("in Real mode the page intro no longer says everything runs against a mock org", async () => {
    await h.mount({ real: fakeReal() });
    expect(text("head-intro")).toMatch(/^Real mode: one read-only look/);
    expect(text("head-intro")).not.toMatch(/mock org on a lab clock/);
  });

  it("a 5xx or a body that is not JSON reads as a server problem, not as a refusal", async () => {
    const user = await h.mount({ page: "connect", overrides: { "/api/actions": (init) => (init.method === "POST" ? new Response("<html>bad gateway</html>", { status: 502 }) : null) } });
    await screen.findByTestId("wizard");
    await user.click(screen.getByTestId("convert-org"));
    const last = await screen.findByTestId("last-action");
    expect(last).toHaveTextContent(/server problem \(HTTP 502\)/);
    expect(last).not.toHaveTextContent(/refused: bad_response/);
  });

  it("Reset gives a visible confirmation, not only a screen-reader one", async () => {
    const user = await h.mount();
    await user.click(screen.getByTestId("reset"));
    const note = screen.getByTestId("reset-note");
    await waitFor(() => expect(note).toHaveTextContent(/^Reset:/));
    expect(note.className).toBe("reset-note");
    expect(note.className).not.toMatch(/sr-only/);
  });
});
