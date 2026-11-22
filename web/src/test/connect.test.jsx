import { describe, expect, it } from "vitest";
import { OUTCOMES } from "../../../server/src/data.js";
import { SCENARIOS, runScenario } from "../../../server/src/scenarios.js";
import { VERTICALS } from "../../../server/src/cast.js";
import { nav, screen, text, useLabHarness, waitFor, within } from "./util.jsx";

const h = useLabHarness();
const C = VERTICALS.finance;

// For each scripted scenario, the first sign-in the script EXPECTS to be refused: its index (the world is seeded up to just before it) and its inputs.
const refusals = SCENARIOS.flatMap((sc) => {
  const run = runScenario(C, sc);
  return run.steps.flatMap((st, i) => (st.op === "wizard.signIn" && st.expect !== "ok" ? [{ id: sc.id, i, expect: st.expect, params: st.params }] : []));
});

describe("Connect page: the wizard rehearsal", () => {
  it("covers every sign-in failure the scripts reach, each with the mock Salesforce outcome, the cause and the exact fix", async () => {
    expect(refusals.map((r) => r.expect).sort()).toEqual(["invalid_client_id", "missing_refresh_scope", "not_preauthorized", "not_propagated", "permset_not_assigned", "permset_not_linked", "signature_mismatch"].sort());
  });

  for (const r of refusals) {
    it(`Check sign-in refused: ${r.expect} (${r.id}, step ${r.i + 1})`, async () => {
      const user = await h.mount({ seed: [r.id, r.i], page: "connect" });
      await screen.findByTestId("wizard");
      await user.type(screen.getByTestId("consumer-key"), r.params.consumerKey);
      await user.type(screen.getByTestId("authorized-user"), r.params.username);
      await user.click(screen.getByTestId("check-signin"));
      const box = await screen.findByTestId("signin-refused");
      const o = OUTCOMES[r.expect];
      expect(within(box).getByTestId("signin-message")).toHaveTextContent(`Sign-in refused: ${o.cause}`);
      expect(within(box).getByTestId("outcome-cause")).toHaveTextContent(o.cause);
      expect(within(box).getByTestId("outcome-fix")).toHaveTextContent(o.fix);
      if (o.sfError) expect(within(box).getByTestId("outcome-said")).toHaveTextContent(o.sfError + (o.sfDescription ? `, "${o.sfDescription}"` : ""));
      else expect(within(box).queryByTestId("outcome-said")).toBeNull(); // never an invented Salesforce wording
      expect(box).not.toHaveTextContent(/UNVERIFIED|lab-inferred|lab-invented|observed on one org/);
      expect(screen.queryByTestId("signed-in-line")).toBeNull();
      // the raw request and response of the call go through the shared JsonPane
      expect(screen.getByTestId("last-action")).toHaveTextContent("wizard.signIn");
      expect(within(box).queryByTestId("outcome-basis")).toBeNull(); // no label chip
    });
  }

  it("a Username the guide records no failure for is the lab's own refusal and claims nothing about Salesforce", async () => {
    const user = await h.mount({ seed: ["fail-client-id", 12], page: "connect" });
    await screen.findByTestId("wizard");
    await user.type(screen.getByTestId("consumer-key"), C.castConsumerKey);
    await user.type(screen.getByTestId("authorized-user"), C.castAdminEmail);
    await user.click(screen.getByTestId("check-signin"));
    const box = await screen.findByTestId("signin-refused");
    expect(box).toHaveTextContent("not_modelled");
    expect(box).toHaveTextContent(OUTCOMES.not_modelled.cause);
    expect(within(box).queryByTestId("outcome-said")).toBeNull();
  });

  it("there is no sign-in check order card and no basis anywhere on the page", async () => {
    await h.mount({ page: "connect" });
    await screen.findByTestId("wizard");
    expect(screen.queryByTestId("sign-in-order")).toBeNull();
    expect(document.querySelector("main").textContent).not.toMatch(/lab-inferred|lab-invented|lab's own choice|UNVERIFIED|wrong on purpose/);
  });

  it("a clock move over the lab's limit is a named refusal (clock_limit), not a silent no-op", async () => {
    const user = await h.mount({ page: "connect" });
    await screen.findByTestId("lab-clock");
    for (let n = 0; n < 5; n += 1) { await user.clear(screen.getByTestId("advance-custom")); await user.type(screen.getByTestId("advance-custom"), String(800 * 1440)); await user.click(screen.getByTestId("advance-custom-go")); await waitFor(() => expect(screen.getByTestId("last-action")).toBeInTheDocument()); }
    expect(await screen.findByTestId("last-refusal")).toBeInTheDocument();
    expect(screen.getByTestId("last-action")).toHaveTextContent("clock_limit");
  }, 30000);

  it("the wizard's quick fill types the Username of an org user", async () => {
    const user = await h.mount({ seed: ["happy-path", 12], page: "connect" });
    await screen.findByTestId("wizard");
    expect(screen.queryByTestId("fill-email-sfu-1")).toBeNull();
    await user.click(screen.getByTestId("fill-username-sfu-1"));
    expect(screen.getByTestId("authorized-user")).toHaveValue(C.castAdminUsername);
  });

  it("rehearses the whole wizard by hand: six checklist steps, sign-in, then Create Application", async () => {
    const user = await h.mount({ page: "connect" });
    await screen.findByTestId("wizard");
    expect(text("checklist")).toMatch(/0 of 6/);
    expect(screen.getByTestId("no-eca")).toBeInTheDocument();
    expect(screen.getByTestId("no-certs")).toBeInTheDocument();
    expect(screen.getByTestId("generate-key")).toBeDisabled(); // step 1 first
    await user.click(screen.getByTestId("convert-org"));
    await waitFor(() => expect(screen.getByTestId("instance-url")).toHaveTextContent(C.castLoginUrl));
    await user.click(screen.getByTestId("generate-key"));
    await waitFor(() => expect(screen.getByTestId("cert-cert-1")).toBeInTheDocument());
    expect(screen.getByTestId("cert-cert-1")).toHaveTextContent("current");
    await user.click(screen.getByTestId("create-eca"));
    await screen.findByTestId("eca-title");
    expect(screen.getByTestId("eca-active")).toHaveTextContent("not active yet");
    // scopes, JWT bearer, certificate, Permitted Users
    await user.click(screen.getByTestId("scope-api"));
    await waitFor(() => expect(screen.getByTestId("scope-api")).toBeChecked());
    await user.click(screen.getByTestId("scope-refresh_token"));
    await waitFor(() => expect(screen.getByTestId("scope-refresh_token")).toBeChecked());
    await user.selectOptions(screen.getByTestId("cert-select"), "cert-1");
    await waitFor(() => expect(screen.getByTestId("jwt-bearer")).toBeChecked());
    expect(screen.getByTestId("cert-line")).toHaveTextContent("valid");
    await user.click(screen.getByTestId("permitted-admin_preauthorized"));
    await waitFor(() => expect(screen.getByTestId("permitted-admin_preauthorized")).toBeChecked());
    expect(screen.getByTestId("check-create-app") ?? null).toBeNull; // (no such control: the checklist is a status, not a button)
  }, 30000);

  it("finishes the by-hand rehearsal: link the set, assign it, wait on the lab clock, show the Consumer Key, sign in, create the application", async () => {
    const user = await h.mount({ seed: ["happy-path", 6], page: "connect" }); // org URL, key, app, scopes, JWT, Permitted Users done
    await screen.findByTestId("eca-title");
    await user.type(screen.getByTestId("new-set-label"), C.castIntegrationSet);
    await user.click(screen.getByTestId("create-set"));
    await screen.findByTestId("set-ps-4");
    await user.click(screen.getByTestId("link-ps-4"));
    await waitFor(() => expect(screen.getByTestId("set-ps-4")).toHaveTextContent("linked"));
    await user.click(screen.getByTestId("assign-btn"));
    await waitFor(() => expect(screen.getByTestId("checklist")).toHaveTextContent("6 of 6"));
    // too early: the same generic error, not propagated
    await user.click(screen.getByTestId("request-code"));
    const mail = await screen.findByTestId("mailbox");
    const code = /Code (\d+)/.exec(mail.textContent)[1];
    await user.type(screen.getByTestId("code"), code);
    await user.click(screen.getByTestId("reveal-key"));
    await waitFor(() => expect(screen.getByTestId("eca-key")).toHaveTextContent(C.castConsumerKey));
    expect(screen.getByTestId("eca-key")).toHaveTextContent(/MOCK consumer key/);
    await user.click(screen.getByTestId("use-key"));
    expect(screen.getByTestId("consumer-key")).toHaveValue(C.castConsumerKey);
    await user.click(screen.getByTestId("fill-username-sfu-1"));
    await user.click(screen.getByTestId("check-signin"));
    expect(await screen.findByTestId("signin-refused")).toHaveTextContent(OUTCOMES.not_propagated.cause);
    // the lab clock only moves forward: +10 min, then it works
    await user.click(screen.getByTestId("advance-10"));
    await waitFor(() => expect(text("clock-now")).toMatch(/09:10 UTC/));
    await user.click(screen.getByTestId("check-signin"));
    expect(await screen.findByTestId("signin-ok")).toHaveTextContent(/Signed in to .* as /);
    expect(screen.getByTestId("signed-in-line")).toHaveTextContent("Signed in");
    expect(screen.getByLabelText("mock access token")).toHaveTextContent(/mock-sf-access-/);
    expect(screen.getByTestId("signin-ok")).toHaveTextContent(OUTCOMES.signed_in.cause);
    expect(screen.getByTestId("signin-ok")).not.toHaveTextContent(/Salesforce said|was not captured|failure/i); // a success carries no failure sentence
    expect(screen.queryByTestId("outcome-said")).toBeNull();
    expect(screen.getByTestId("check-note")).toHaveTextContent(/runs automatically as soon as the three values are filled/);
    // Create Application
    await user.type(screen.getByTestId("app-name"), "abc");
    expect(screen.getByTestId("create-app")).toBeDisabled(); // needs 4 characters
    await user.type(screen.getByTestId("app-name"), "d Ledger link");
    await user.click(screen.getByTestId("create-app"));
    await waitFor(() => expect(screen.getByTestId("app-line")).toHaveTextContent("Sync Status Ready"));
  }, 30000);

  it("the lab clock only moves forward: no rewind control, a bad number cannot be sent, a custom move works", async () => {
    const user = await h.mount({ page: "connect" });
    const clock = await screen.findByTestId("lab-clock");
    expect(within(clock).queryByRole("button", { name: /back|rewind|-\d/i })).toBeNull();
    expect(clock).toHaveTextContent(/only moves forward/);
    const go = screen.getByTestId("advance-custom-go");
    expect(go).toBeDisabled();
    await user.type(screen.getByTestId("advance-custom"), "-5");
    expect(go).toBeDisabled();
    await user.clear(screen.getByTestId("advance-custom"));
    await user.type(screen.getByTestId("advance-custom"), "45");
    await user.click(go);
    await waitFor(() => expect(text("clock-now")).toMatch(/09:45 UTC/));
    await user.click(screen.getByTestId("advance-1440"));
    await waitFor(() => expect(text("clock-now")).toMatch(/2026-11-03 09:45 UTC/));
    expect(h.lab.calls.filter((c) => c.path === "/api/actions").map((c) => c.body.params.minutes)).toEqual([45, 1440]);
  });

  it("a refused action (a certificate before any key) is shown with the server's words, and the other controls stay usable", async () => {
    const user = await h.mount({ page: "connect" });
    await screen.findByTestId("wizard");
    await user.click(screen.getByTestId("convert-org"));
    await waitFor(() => expect(screen.getByTestId("instance-url")).toBeInTheDocument());
    await user.click(screen.getByTestId("create-eca"));
    await screen.findByTestId("eca-title");
    await user.click(screen.getByTestId("jwt-bearer")); // no certificate uploaded yet
    expect(await screen.findByTestId("last-refusal")).toHaveTextContent("Upload the .crt the wizard downloaded");
    expect(screen.getByTestId("jwt-bearer")).not.toBeChecked();
  });

  it("long names do not break the layout and are shown inert", async () => {
    const user = await h.mount({ page: "connect" });
    await screen.findByTestId("wizard");
    const long = "N".repeat(79);
    await user.click(screen.getByTestId("convert-org"));
    await waitFor(() => expect(screen.getByTestId("instance-url")).toBeInTheDocument());
    await user.clear(screen.getByTestId("eca-name"));
    await user.type(screen.getByTestId("eca-name"), `<b>${long.slice(0, 60)}</b>`);
    await user.click(screen.getByTestId("create-eca"));
    const title = await screen.findByTestId("eca-title");
    expect(title.textContent).toBe(`<b>${long.slice(0, 60)}</b>`); // text, never markup
    expect(title.querySelector("b")).toBeNull();
  });

  it("shows the guide's troubleshooting table", async () => {
    const user = await h.mount({ page: "connect" });
    await screen.findByTestId("wizard");
    await user.click(screen.getByText(/The guide's table/));
    const rows = within(screen.getByTestId("troubleshooting")).getAllByRole("row");
    expect(rows.length).toBe(16); // the header and the 15 symptoms
    expect(within(screen.getByTestId("troubleshooting")).queryByText("lab-inferred")).toBeNull();
  });
});
