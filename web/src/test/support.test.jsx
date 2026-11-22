import { describe, expect, it } from "vitest";
import { VERTICALS } from "../../../server/src/cast.js";
import { nav, screen, text, useLabHarness, waitFor, within } from "./util.jsx";

const h = useLabHarness();
const C = VERTICALS.finance;
const ready = async () => { await screen.findByTestId("cases-denied"); await waitFor(() => expect(screen.getByTestId("support-note")).not.toBeDisabled()); };
const request = async (user, note = "P1: need the case history") => {
  await waitFor(() => expect(screen.getByTestId("support-note")).not.toBeDisabled());
  await user.clear(screen.getByTestId("support-note"));
  if (note) await user.type(screen.getByTestId("support-note"), note);
  await user.click(screen.getByTestId("support-request"));
};

describe("Support P1 page: three panels together", () => {
  it("is the first page, shows the engineer's view, Privilege and The old way together, and starts denied with no case title and no count", async () => {
    await h.mount();
    expect(document.querySelector('nav[aria-label="Lab sections"] a').textContent).toBe("Support P1");
    expect(document.querySelector('nav[aria-label="Lab sections"] a')).toHaveAttribute("aria-current", "page");
    await ready();
    for (const id of ["sf-panel", "privilege-panel", "oldway-panel"]) expect(screen.getByTestId(id), id).toBeInTheDocument();
    expect(text("cases-denied")).toBe("You don't have access to Cases");
    const sf = screen.getByTestId("sf-panel");
    for (const t of [C.castCaseP1Title, C.castCase2Title, C.castCase3Title, "00001041"]) expect(sf).not.toHaveTextContent(t);
    expect(sf.textContent).not.toMatch(/\b[0-3]\s+cases\b|\(\d+\)/i);
    expect(text("sf-user")).toContain("Omar Reyes"); expect(text("sf-user")).toContain("Minimum Access - Salesforce");
    expect(text("sf-held")).toBe("none");
    expect(screen.getByTestId("beat-1")).toHaveAttribute("aria-current", "step");
    expect(screen.getByTestId("support-end-access")).toBeDisabled();
    expect(text("support-rec")).toMatch(/0 confirmed/);
  });

  it("request with a note and an end time: Privilege grants it, the P1 and two other cases appear, the receipt reads Granted, 1 confirmed", async () => {
    const user = await h.mount();
    await ready();
    await request(user);
    await screen.findByTestId("cases-list");
    const rows = within(screen.getByTestId("cases-list")).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("P1"); expect(rows[0]).toHaveTextContent(C.castCaseP1Title);
    expect(text("sf-held")).toBe(C.castPermSet);
    expect(screen.queryByTestId("cases-denied")).toBeNull();
    expect(screen.getByTestId("beat-2")).toHaveAttribute("aria-current", "step");
    expect(text("support-last-request")).toMatch(/Omar Reyes asked for Case Read Access until 2026-11-02 11:\d\d UTC/);
    expect(text("support-last-note")).toBe("P1: need the case history");
    expect(text("support-policy-status")).toBe("Active");
    expect(text("support-receipts")).toMatch(/Granted/);
    expect(text("support-confirmed")).toBe("1 confirmed");
    expect(screen.getByTestId("support-hint")).toHaveTextContent("Another request now would be refused: Already has this permission set");
  });

  it("End access deletes the policy: Revoke pending, access still live (Cases still listed), then the assignment is gone and Cases is denied again; the receipt shows Granted then Revoked", async () => {
    const user = await h.mount();
    await ready();
    await request(user);
    await screen.findByTestId("cases-list");
    await user.click(screen.getByTestId("support-end-access"));
    await waitFor(() => expect(text("support-policy-status")).toBe("Revoke pending, access still live"));
    expect(screen.getByTestId("cases-list")).toBeInTheDocument(); // still live
    expect(text("support-receipts")).toMatch(/Granted\s*then\s*Revoke pending, access still live/);
    expect(h.lab.calls.filter((c) => c.path === "/api/actions").map((c) => c.body.op)).toEqual(["support.requestAccess", "policy.delete"]);
    await screen.findByTestId("cases-denied", {}, { timeout: 8000 }); // the page refreshes on its own after a moment
    expect(text("sf-held")).toBe("none");
    expect(text("support-receipts")).toMatch(/Granted\s*then\s*Revoke pending, access still live\s*then\s*Revoked/);
    expect(text("support-policy")).toBe("No active policy.");
    expect(text("support-confirmed")).toBe("0 confirmed");
    expect(screen.getByTestId("beat-3")).toHaveAttribute("aria-current", "step");
    expect(screen.getByTestId("support-end-access")).toBeDisabled();
    expect(document.querySelector("main").textContent).not.toContain(C.castCaseP1Title);
  }, 30000);

  it("The old way is marked as narrative, not a Privilege claim, and does not change with the engine", async () => {
    const user = await h.mount();
    await ready();
    const before = screen.getByTestId("oldway-panel").textContent;
    expect(text("oldway-tag")).toBe("Narrative: not a Privilege claim");
    expect(before).toMatch(/no end date/i); expect(before).toContain("Omar Reyes");
    await request(user);
    await screen.findByTestId("cases-list");
    expect(screen.getByTestId("oldway-panel").textContent).toBe(before);
  });

  it("asking again shows the observed refusal text and changes nothing", async () => {
    const user = await h.mount();
    await ready();
    await request(user);
    await screen.findByTestId("cases-list");
    await request(user, "again");
    const box = await screen.findByTestId("support-refusal");
    expect(box).toHaveTextContent("already_has_permission_set"); expect(box).toHaveTextContent("Already has this permission set");
    expect(h.lab.calls.filter((c) => c.path === "/api/actions" && c.body.op === "support.requestAccess")).toHaveLength(2);
  });

  it("Privilege cannot sign in to Salesforce: a named 502 with the cause and fix, and nothing is granted", async () => {
    const user = await h.mount();
    await ready();
    await h.lab.post("/api/actions", { op: "sf.setPermittedUsers", params: { policy: "self_authorize" }, vertical: "finance" });
    await request(user);
    const box = await screen.findByTestId("support-refusal");
    expect(box).toHaveTextContent("salesforce_sign_in_failed");
    expect(box).toHaveTextContent(/Privilege could not sign in to Salesforce/);
    expect(within(box).getByTestId("outcome-fix")).toHaveTextContent(/Admin approved users are pre-authorized/);
    expect(screen.getByTestId("cases-denied")).toBeInTheDocument();
    expect(screen.getByTestId("support-no-receipt")).toBeInTheDocument();
  });

  it("a hostile note is shown as inert text, never as markup, and the box is bounded to 200 characters", async () => {
    const user = await h.mount();
    await ready();
    const hostile = '<img src=x onerror="window.__pwned=1"> <b>bold</b> __proto__ {{castBrand}}';
    await user.click(screen.getByTestId("support-note"));
    await user.paste(hostile);
    expect(screen.getByTestId("support-note")).toHaveAttribute("maxlength", "200");
    await user.click(screen.getByTestId("support-request"));
    await screen.findByTestId("cases-list");
    const note = screen.getByTestId("support-last-note");
    expect(note.textContent).toBe(hostile);
    expect(note.querySelector("img")).toBeNull(); expect(note.querySelector("b")).toBeNull();
    expect(window.__pwned).toBeUndefined();
    expect(screen.getByTestId("support-note")).toHaveValue(""); // sent, the box is empty again
  });

  it("an over-long note is capped by the field, and the server refuses one that gets past it", async () => {
    const user = await h.mount();
    await ready();
    await user.click(screen.getByTestId("support-note"));
    await user.paste("x".repeat(201));
    expect(screen.getByTestId("support-note").value.length).toBe(200);
    const b = await h.lab.post("/api/actions", { op: "support.requestAccess", params: { note: "x".repeat(201), endAt: "2026-11-02T11:00:00Z" }, vertical: "finance", refusalsAs200: true });
    expect(b.ok).toBe(false); expect(b.error).toBe("too_long");
  });

  it("Request access needs a note; the end time choices are lab-clock times", async () => {
    await h.mount();
    await ready();
    expect(screen.getByTestId("support-request")).toBeDisabled();
    const opts = [...screen.getByTestId("support-end").options].map((o) => o.textContent);
    expect(opts).toHaveLength(5); expect(opts[0]).toMatch(/^1 hour: until 2026-11-02 \d\d:\d\d$/);
  });

  it("the vertical changes the case titles and names, not the mechanics", async () => {
    const user = await h.mount();
    await ready();
    await user.selectOptions(screen.getByTestId("vertical-select"), "health");
    await waitFor(() => expect(text("sf-user")).toContain(VERTICALS.health.castAName));
    await waitFor(() => expect(screen.getByTestId("support-note")).not.toBeDisabled());
    await request(user);
    await screen.findByTestId("cases-list");
    expect(screen.getByTestId("cases-list")).toHaveTextContent(VERTICALS.health.castCaseP1Title);
    expect(screen.getByTestId("cases-list")).not.toHaveTextContent(C.castCaseP1Title);
    expect(screen.getByTestId("oldway-panel")).toHaveTextContent(VERTICALS.health.castAName);
  });

  it("an engine that was changed elsewhere: the page offers to set the scene instead of guessing", async () => {
    const user = await h.mount({ seed: ["fail-client-id", 3] });
    expect(await screen.findByTestId("support-notready")).toHaveTextContent(/changed on another page/);
    expect(screen.getByTestId("support-request")).toBeDisabled();
    await user.click(screen.getByTestId("support-prepare"));
    await screen.findByTestId("cases-denied");
    await waitFor(() => expect(screen.queryByTestId("support-notready")).toBeNull());
  });

  it("a server problem on load or on the request is named, never blank", async () => {
    const user = await h.mount({ overrides: { "/api/actions": (init) => (init.method === "POST" ? new Response("<html>bad gateway</html>", { status: 502 }) : null) } });
    await ready();
    await request(user);
    const box = await screen.findByTestId("support-refusal");
    expect(box).toHaveTextContent(/server problem \(HTTP 502\)/);
    expect(screen.getByTestId("cases-denied")).toBeInTheDocument();
  });

  it("Real mode: the page says Real only reads and shows no case", async () => {
    const { fakeReal } = await import("./harness.js");
    await h.mount({ real: fakeReal() });
    expect(await screen.findByTestId("real-readonly")).toHaveTextContent(/Real only reads/);
    expect(screen.queryByTestId("sf-panel")).toBeNull();
  });

  it("the other pages follow the same world: Link shows the engineer linked, Grant shows the receipt", async () => {
    const user = await h.mount();
    await ready();
    await request(user);
    await screen.findByTestId("cases-list");
    await nav(user, "Grant and revoke");
    expect(await screen.findByTestId("receipt-rcpt-0001")).toHaveTextContent("Granted");
    await nav(user, "Link");
    expect(await screen.findByTestId("pu-pu-a")).toHaveTextContent("Linked");
  });
});
