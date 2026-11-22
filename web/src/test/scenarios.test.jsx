import { describe, expect, it } from "vitest";
import { OUTCOMES } from "../../../server/src/data.js";
import { SCENARIOS } from "../../../server/src/scenarios.js";
import { nav, screen, text, useLabHarness, waitFor, within } from "./util.jsx";

const h = useLabHarness();

describe("Scenarios page", () => {
  it("lists the 12 scripted scenarios (the Support P1 story first) and the three vertical packs", async () => {
    await h.mount({ page: "scenarios" });
    const cards = SCENARIOS.map((s) => screen.getByTestId(`scenario-${s.id}`));
    expect(cards).toHaveLength(12);
    expect(cards[0]).toHaveTextContent("Scenario 1 of 12"); expect(cards[0]).toHaveTextContent("Support P1");
    for (const v of ["finance", "health", "retail"]) expect(screen.getByTestId(`pack-${v}`)).toBeInTheDocument();
    expect(screen.getByTestId("pack-finance")).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector("main").textContent).not.toMatch(/UNVERIFIED|lab-invented|lab-inferred|observed on one org/);
    expect(screen.queryByTestId("claim-tag")).toBeNull(); expect(screen.queryByTestId("basis")).toBeNull();
  });

  it("the pack picker changes the cast in the scenario text", async () => {
    const user = await h.mount({ page: "scenarios" });
    await user.click(screen.getByTestId("scenario-happy-path"));
    expect(screen.getByTestId("scenario-panel")).toHaveTextContent("Omar Reyes");
    await user.click(screen.getByTestId("pack-health"));
    await waitFor(() => expect(screen.getByTestId("pack-health")).toHaveAttribute("aria-pressed", "true"));
    await user.click(await screen.findByTestId("scenario-happy-path"));
    expect(screen.getByTestId("scenario-panel")).not.toHaveTextContent("Omar Reyes");
  });

  it("Run shows step 1; Next step adds one at a time with the expected result and the raw request and response", async () => {
    const user = await h.mount({ page: "scenarios" });
    await user.click(screen.getByTestId("scenario-happy-path"));
    expect(screen.queryByTestId("run-steps")).toBeNull();
    await user.click(screen.getByTestId("run"));
    await screen.findByTestId("run-step-1");
    expect(screen.queryByTestId("run-step-2")).toBeNull();
    expect(screen.getByTestId("expect-1")).toHaveTextContent("Expected: it succeeds");
    expect(screen.getByTestId("met-1")).toHaveTextContent("As expected");
    expect(text("run-summary")).toMatch(/Step 1 of 20/);
    // the raw request and response go through the shared JsonPane (Form and JSON buttons), never a hand-made <pre>
    const step = screen.getByTestId("run-step-1");
    expect(within(step).getAllByRole("button", { name: "JSON" }).length).toBeGreaterThanOrEqual(2);
    expect(within(step).getByLabelText("step 1 request")).toHaveTextContent("wizard.orgUrl");
    expect(within(step).getByLabelText("step 1 response")).toHaveTextContent("instanceUrl");
    await user.click(screen.getByTestId("next-step"));
    await screen.findByTestId("run-step-2");
    expect(text("run-summary")).toMatch(/Step 2 of 20/);
    await user.click(screen.getByTestId("run-all"));
    await screen.findByTestId("run-step-20");
    expect(text("run-summary")).toMatch(/every step so far as expected/);
    expect(text("run-summary")).toMatch(/finished/);
    expect(screen.getByTestId("next-step")).toBeDisabled();
    // the Salesforce calls Privilege made are shown too
    expect(within(screen.getByTestId("run-step-13")).getByText(/What the mock Privilege app sent to Salesforce/)).toBeInTheDocument();
  });

  it("a scenario that is EXPECTED to be refused shows the expectation, the refusal, the cause and the fix", async () => {
    const user = await h.mount({ page: "scenarios" });
    await user.click(screen.getByTestId("scenario-fail-client-id"));
    await user.click(screen.getByTestId("run-all"));
    const idx = SCENARIOS.find((s) => s.id === "fail-client-id").steps.findIndex((x) => x.expect === "invalid_client_id") + 1;
    await screen.findByTestId(`run-step-${idx}`);
    expect(text(`expect-${idx}`)).toBe("Expected: it is refused with invalid_client_id");
    expect(text(`met-${idx}`)).toBe("As expected");
    expect(text(`refusal-${idx}`)).toMatch(/invalid_client_id: Sign-in refused: Consumer Key copied wrongly\./);
    const step = screen.getByTestId(`run-step-${idx}`);
    expect(within(step).getByTestId("outcome-cause")).toHaveTextContent(OUTCOMES.invalid_client_id.cause);
    expect(within(step).getByTestId("outcome-fix")).toHaveTextContent(/Copy it again/);
    expect(within(step).getByTestId("outcome-said")).toHaveTextContent("invalid_client_id");
  });

  it("Reset clears the shown run", async () => {
    const user = await h.mount({ page: "scenarios" });
    await user.click(screen.getByTestId("scenario-happy-path"));
    await user.click(screen.getByTestId("run"));
    await screen.findByTestId("run-step-1");
    await user.click(screen.getByTestId("story-reset"));
    await waitFor(() => expect(screen.queryByTestId("run-steps")).toBeNull());
  });

  it("every scenario runs from the page with every step as expected (the engine and the page agree)", async () => {
    const user = await h.mount({ page: "scenarios" });
    for (const sc of SCENARIOS) {
      await user.click(screen.getByTestId(`scenario-${sc.id}`));
      await user.click(screen.getByTestId("run-all"));
      await waitFor(() => expect(screen.getByTestId("run-summary")).toHaveTextContent(/finished/));
      expect(text("run-summary"), sc.id).toMatch(/every step so far as expected/);
    }
  }, 60000);

  it("there is no honesty panel, no lab-invented list and no label chip: the banner is the only honesty text", async () => {
    await h.mount({ page: "scenarios" });
    expect(screen.queryByTestId("honesty")).toBeNull(); expect(screen.queryByTestId("lab-invented")).toBeNull(); expect(screen.queryByTestId("not-demonstrated")).toBeNull(); expect(screen.queryByTestId("claims")).toBeNull();
    expect(screen.getByTestId("banner")).toHaveTextContent("Simulated: every behaviour shown was recorded in one real Privilege and Salesforce run.");
    expect(screen.getByTestId("limits")).toHaveTextContent(/Limits:/);
  });

  it("the removed scenarios are not offered, and the revoke scenario ends with the assignment gone", async () => {
    const user = await h.mount({ page: "scenarios" });
    for (const gone of ["grant-expires", "hand-assigned-drift", "sign-in-breaks-later", "fail-cert-expired", "fail-wrong-username", "fail-jwt-not-enabled"]) expect(screen.queryByTestId(`scenario-${gone}`), gone).toBeNull();
    await user.click(screen.getByTestId("scenario-revoke-by-delete"));
    await user.click(screen.getByTestId("run-all"));
    await screen.findByTestId("run-step-3");
    expect(screen.getByTestId("run-step-3")).toHaveTextContent(/assignment is gone/);
    expect(screen.getByTestId("run-steps").textContent).not.toMatch(/reconcile removes|lab-invented|lab-inferred/i);
  });
});
