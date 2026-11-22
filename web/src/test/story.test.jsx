import { describe, expect, it } from "vitest";
import { OUTCOMES } from "../../../server/src/data.js";
import { SCENARIOS } from "../../../server/src/scenarios.js";
import { nav, screen, text, useLabHarness, waitFor, within } from "./util.jsx";

const h = useLabHarness();

describe("Story page", () => {
  it("lists the 17 scripted scenarios and the three vertical packs", async () => {
    await h.mount();
    const cards = SCENARIOS.map((s) => screen.getByTestId(`scenario-${s.id}`));
    expect(cards).toHaveLength(17);
    expect(cards[0]).toHaveTextContent("Scenario 1 of 17");
    for (const v of ["finance", "health", "retail"]) expect(screen.getByTestId(`pack-${v}`)).toBeInTheDocument();
    expect(screen.getByTestId("pack-finance")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("claim-tag")).toHaveTextContent(/observed on one org and one Privilege build, UNVERIFIED as a product claim/);
  });

  it("the pack picker changes the cast in the scenario text", async () => {
    const user = await h.mount();
    await user.click(screen.getByTestId("scenario-happy-path"));
    expect(screen.getByTestId("scenario-panel")).toHaveTextContent("Omar Reyes");
    await user.click(screen.getByTestId("pack-health"));
    await waitFor(() => expect(screen.getByTestId("pack-health")).toHaveAttribute("aria-pressed", "true"));
    await user.click(await screen.findByTestId("scenario-happy-path"));
    expect(screen.getByTestId("scenario-panel")).not.toHaveTextContent("Omar Reyes");
  });

  it("Run shows step 1; Next step adds one at a time with the expected result and the raw request and response", async () => {
    const user = await h.mount();
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
    const user = await h.mount();
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
    const user = await h.mount();
    await user.click(screen.getByTestId("scenario-happy-path"));
    await user.click(screen.getByTestId("run"));
    await screen.findByTestId("run-step-1");
    await user.click(screen.getByTestId("story-reset"));
    await waitFor(() => expect(screen.queryByTestId("run-steps")).toBeNull());
  });

  it("every scenario runs from the page with every step as expected (the engine and the page agree)", async () => {
    const user = await h.mount();
    for (const sc of SCENARIOS) {
      await user.click(screen.getByTestId(`scenario-${sc.id}`));
      await user.click(screen.getByTestId("run-all"));
      await waitFor(() => expect(screen.getByTestId("run-summary")).toHaveTextContent(/finished/));
      expect(text("run-summary"), sc.id).toMatch(/every step so far as expected/);
    }
  }, 60000);

  it("the honesty panel shows what is simulated and what is lab-invented, with the three labels", async () => {
    await h.mount();
    const panel = screen.getByTestId("honesty");
    const items = within(screen.getByTestId("lab-invented")).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(within(panel).getByText(/Automatic expiry by a reaper/)).toBeInTheDocument();
    expect(items.every((li) => within(li).getByTestId("basis").textContent === "lab-invented")).toBe(true);
    expect(screen.getByTestId("not-demonstrated")).toBeInTheDocument();
    expect(panel).toHaveTextContent(/observed.*lab-inferred.*lab-invented/s);
  });

  it("a scenario step that shows an expiry or a drift finding is marked lab-invented under that step", async () => {
    const user = await h.mount();
    await user.click(screen.getByTestId("scenario-grant-expires"));
    await user.click(screen.getByTestId("run-all"));
    await screen.findByTestId("run-step-4");
    expect(screen.getByTestId("step-labinv-3")).toHaveTextContent(/Automatic expiry by a reaper/);
    expect(screen.getByTestId("step-labinv-1")).toBeEmptyDOMElement(); // the grant itself is not (the list is empty and hidden)
    await user.click(screen.getByTestId("scenario-hand-assigned-drift"));
    await user.click(screen.getByTestId("run-all"));
    await screen.findByTestId("run-step-9");
    expect(screen.getByTestId("step-labinv-2")).toHaveTextContent(/Discovered. and .orphaned./);
  });
});
