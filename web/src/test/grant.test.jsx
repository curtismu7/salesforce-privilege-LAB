import { describe, expect, it } from "vitest";
import { VERTICALS } from "../../../server/src/cast.js";
import { screen, text, useLabHarness, userEvent, waitFor, within } from "./util.jsx";

const h = useLabHarness();
const C = VERTICALS.finance;

async function openGrant(user) {
  await user.click(await screen.findByTestId("open-grant"));
  return screen.findByTestId("grant-dialog");
}
const grant = async (user, setId, duration = "60") => {
  const dlg = screen.getByTestId("grant-dialog");
  await user.selectOptions(within(dlg).getByTestId("grant-set"), setId);
  await user.selectOptions(within(dlg).getByTestId("grant-duration"), duration);
  await user.click(within(dlg).getByTestId("grant-submit"));
};

describe("Grant and revoke page", () => {
  it("before there is an application or a linked user the grant button is off and says what to do first", async () => {
    await h.mount({ page: "grant" });
    expect(await screen.findByTestId("open-grant")).toBeDisabled();
    expect(screen.getByTestId("grant-no-app")).toBeInTheDocument();
    expect(screen.getByTestId("no-sets")).toBeInTheDocument();
    expect(screen.getByTestId("no-policies")).toHaveTextContent("Active Policies (0)");
    expect(screen.getByTestId("no-receipts")).toBeInTheDocument();
    expect(screen.getByTestId("no-reconcile")).toBeInTheDocument();
  });

  it("lists the permission sets with their licence badges and the refusal text each one would get", async () => {
    await h.mount({ seed: ["grant-rules", 0], page: "grant" });
    await screen.findByTestId("permissions");
    expect(screen.getByTestId("perm-ps-1")).toHaveTextContent("no licence needed");
    expect(screen.getByTestId("perm-ps-2")).toHaveTextContent(`needs permission set license: ${C.castLicensedSet} PSL`);
    expect(text("perm-refusal-ps-2")).toBe("Needs a permission set license");
    expect(screen.getByTestId("perm-ps-3")).toHaveTextContent(`user licence ${C.castOtherLicense}`);
    expect(text("perm-refusal-ps-3")).toBe(`License Salesforce ≠ ${C.castOtherLicense}`);
    expect(screen.queryByTestId("perm-refusal-ps-1")).toBeNull();
  });

  it("the grant dialog hints at each refusal, and the server's own refusal text is shown when it is tried", async () => {
    const user = await h.mount({ seed: ["grant-rules", 0], page: "grant" });
    const dlg = await openGrant(user);
    await user.selectOptions(within(dlg).getByTestId("grant-set"), "ps-2");
    expect(within(dlg).getByTestId("grant-hint")).toHaveTextContent("Needs a permission set license");
    await user.click(within(dlg).getByTestId("grant-submit"));
    expect(await within(dlg).findByTestId("grant-refusal")).toHaveTextContent("needs_permission_set_license: Needs a permission set license");
    await user.selectOptions(within(dlg).getByTestId("grant-set"), "ps-3");
    await user.click(within(dlg).getByTestId("grant-submit"));
    await waitFor(() => expect(within(dlg).getByTestId("grant-refusal")).toHaveTextContent(`license_mismatch: License Salesforce ≠ ${C.castOtherLicense}`));
    // a plain set, with the shortest duration: granted, and the dialog closes
    await grant(user, "ps-1", "15");
    await waitFor(() => expect(screen.queryByTestId("grant-dialog")).toBeNull());
    expect(await screen.findByTestId("policy-pol-0001")).toHaveTextContent("Active");
    expect(screen.getByTestId("receipt-status-rcpt-0001")).toHaveTextContent("Granted");
    expect(text("count-confirmed")).toMatch(/Confirmed\s*1/);
    expect(text("count-observed")).toMatch(/Observed\s*1/);
    // again: the same set is already held
    const dlg2 = await openGrant(user);
    await user.selectOptions(within(dlg2).getByTestId("grant-set"), "ps-1");
    expect(within(dlg2).getByTestId("grant-hint")).toHaveTextContent("Already has this permission set");
    await user.click(within(dlg2).getByTestId("grant-submit"));
    expect(await within(dlg2).findByTestId("grant-refusal")).toHaveTextContent("already_has_permission_set: Already has this permission set");
  }, 30000);

  it("the grant dialog offers a duration list, defaulting to a short window, with the observed-default option named", async () => {
    const user = await h.mount({ seed: ["grant-rules", 0], page: "grant" });
    const dlg = await openGrant(user);
    const opts = within(within(dlg).getByTestId("grant-duration")).getAllByRole("option").map((o) => o.textContent);
    expect(opts).toContain("15 minutes");
    expect(opts.at(-1)).toMatch(/about a year \(the observed default\)/);
    expect(within(dlg).getByTestId("grant-duration")).toHaveValue("15"); // the shortest offered, as the dialog's own text says
  });

  it("revoke is a policy Delete: 'Revoke pending, access still live', then Sync removes the assignment and the receipt reads Revoked", async () => {
    const user = await h.mount({ seed: ["revoke-by-delete", 1], page: "grant" });
    await screen.findByTestId("policy-pol-0001");
    expect(screen.getByTestId("assignments")).toHaveTextContent("Privilege policy");
    expect(screen.queryByRole("button", { name: /^Revoke$/ })).toBeNull(); // there is no Revoke button for a policy
    await user.click(screen.getByTestId("delete-pol-0001"));
    await waitFor(() => expect(text("policy-status-pol-0001")).toBe("Revoke pending, access still live"));
    expect(text("receipt-status-rcpt-0001")).toBe("Revoke pending, access still live");
    expect(screen.getByTestId("delete-pol-0001")).toBeDisabled();
    expect(screen.getByTestId("assignments")).toHaveTextContent("Privilege policy"); // access still live in Salesforce
    expect(text("count-revokePending")).toMatch(/Revoke pending\s*1/);
    await user.click(screen.getByTestId("grant-sync"));
    await waitFor(() => expect(screen.getByTestId("no-policies")).toBeInTheDocument());
    expect(screen.getByTestId("ended-count")).toHaveTextContent("Expired / Revoked: 1");
    expect(text("receipt-status-rcpt-0001")).toBe("Revoked");
    expect(screen.getByTestId("assignments")).not.toHaveTextContent("Privilege policy"); // the integration user's own assignment stays
    expect(screen.getByTestId("assignments")).not.toHaveTextContent(C.castPermSet);
    expect(text("rec-line")).toMatch(/1 Expired \/ Revoked/);
  });

  it("the reaper expires a grant by itself once the lab clock passes the window", async () => {
    const user = await h.mount({ seed: ["grant-expires", 1], page: "grant" });
    await screen.findByTestId("policy-pol-0001");
    await user.type(screen.getByTestId("advance-custom"), "59");
    await user.click(screen.getByTestId("advance-custom-go"));
    await waitFor(() => expect(text("clock-now")).toMatch(/10:10 UTC/));
    expect(text("policy-status-pol-0001")).toBe("Active"); // still live
    await user.type(screen.getByTestId("advance-custom"), "2");
    await user.click(screen.getByTestId("advance-custom-go"));
    await waitFor(() => expect(screen.getByTestId("no-policies")).toBeInTheDocument());
    expect(text("receipt-status-rcpt-0001")).toBe("Expired");
    expect(screen.getByTestId("ended-count")).toHaveTextContent("1 (pol-0001 expired)");
    expect(screen.getByTestId("assignments")).not.toHaveTextContent(C.castPermSet);
  }, 30000);

  it("the reaper button also runs it by hand", async () => {
    const user = await h.mount({ seed: ["grant-expires", 1], page: "grant" });
    await screen.findByTestId("policy-pol-0001");
    await user.click(screen.getByTestId("reaper"));
    await waitFor(() => expect(screen.getByTestId("last-action")).toHaveTextContent("reaper.run"));
    expect(text("policy-status-pol-0001")).toBe("Active"); // the window has not closed yet
  });

  it("hand-assigned access shows as discovered, and Revoke removes it", async () => {
    const user = await h.mount({ seed: ["hand-assigned-drift", 0], page: "grant" });
    await screen.findByTestId("hand-assign");
    await user.selectOptions(screen.getByTestId("hand-user"), "sfu-2");
    await user.selectOptions(screen.getByTestId("hand-set"), "ps-1");
    await user.click(screen.getByTestId("hand-go"));
    await waitFor(() => expect(screen.getByTestId("assignments")).toHaveTextContent("by hand"));
    await user.click(screen.getByTestId("reconcile"));
    const f = await screen.findByTestId("finding-pu-a-ps-1");
    expect(f).toHaveTextContent("discovered");
    expect(text("count-discovered")).toMatch(/Discovered\s*1/);
    await user.click(screen.getByTestId("revoke-pu-a-ps-1"));
    await waitFor(() => expect(screen.queryByTestId("finding-pu-a-ps-1")).toBeNull());
    expect(screen.getByTestId("assignments")).not.toHaveTextContent(C.castPermSet);
    expect(screen.getByTestId("receipts")).toHaveTextContent("drift");
  });

  it("access Privilege once granted and ended, assigned by hand again, shows as orphaned", async () => {
    const user = await h.mount({ seed: ["hand-assigned-drift", 7], page: "grant" });
    await screen.findByTestId("hand-assign");
    await user.click(screen.getByTestId("reconcile"));
    expect(await screen.findByTestId("finding-pu-a-ps-1")).toHaveTextContent("orphaned");
    expect(text("count-orphaned")).toMatch(/Orphaned\s*1/);
    expect(screen.getByTestId("reconcile-card")).toHaveTextContent(/how the product classifies and handles it was not observed/);
  });

  it("a downstream failure (Privilege can no longer sign in) is a named refusal in the dialog, not a blank", async () => {
    const user = await h.mount({ seed: ["sign-in-breaks-later", 4], page: "grant" });
    const dlg = await openGrant(user);
    await user.selectOptions(within(dlg).getByTestId("grant-set"), "ps-5");
    await user.click(within(dlg).getByTestId("grant-submit"));
    const refusal = await within(dlg).findByTestId("grant-refusal");
    expect(refusal).toHaveTextContent("salesforce_sign_in_failed: Privilege could not sign in to Salesforce");
    expect(screen.getByTestId("grant-dialog")).toBeInTheDocument(); // stays open so the visitor reads it
  });

  it("a very long permission-set name wraps inside its cell", async () => {
    const user = await h.mount({ seed: ["grant-rules", 0], page: "grant" });
    await screen.findByTestId("permissions");
    // create it in Salesforce on the Connect page's op via the page's own API
    await h.lab.post("/api/actions", { op: "sf.createPermissionSet", params: { label: "L".repeat(79) }, vertical: "finance" });
    await user.click(screen.getByTestId("grant-sync"));
    await waitFor(() => expect(screen.getByTestId("permissions")).toHaveTextContent("L".repeat(79)));
    expect(screen.getByTestId("permissions").querySelector(".scroll")).not.toBeNull();
  });

  it("labels fidelity: deleting a policy is observed, the automatic expiry (the reaper) is lab-invented", async () => {
    await h.mount({ seed: ["revoke-by-delete", 1], page: "grant" });
    await screen.findByTestId("intro-observed");
    expect(screen.getByTestId("intro-observed")).toHaveTextContent("removed by deleting that policy");
    expect(screen.getByTestId("intro-observed")).not.toHaveTextContent(/reaper/);
    expect(screen.getByTestId("intro-observed-basis")).toHaveTextContent("observed");
    expect(screen.getByTestId("intro-invented")).toHaveTextContent(/ends a grant by itself.*reaper/);
    expect(screen.getByTestId("intro-invented-basis")).toHaveTextContent("lab-invented");
    expect(screen.getByTestId("intro-invented-basis")).toHaveAttribute("data-state", "bad");
    expect(screen.getByTestId("reaper")).toHaveTextContent("lab-invented");
  });

  it("after a Delete the note 'The next reconcile or Sync removes the assignment in Salesforce' carries a lab-invented marker", async () => {
    const user = await h.mount({ seed: ["revoke-by-delete", 1], page: "grant" });
    await screen.findByTestId("policy-pol-0001");
    await user.click(screen.getByTestId("delete-pol-0001"));
    await waitFor(() => expect(screen.getByTestId("last-note")).toHaveTextContent("The next reconcile or Sync removes the assignment in Salesforce"));
    expect(screen.getByTestId("note-basis")).toHaveTextContent("lab-invented");
    expect(screen.getAllByTestId("labinv-reconcile-clears").length).toBeGreaterThanOrEqual(2); // under the action and under Active Policies
    expect(screen.getByTestId("pending-labinv")).toHaveTextContent(/which action clears it is the lab's reading/);
  });

  it("an expiry shown by the reaper, a reconcile finding and the duration list are each marked lab-invented where they appear", async () => {
    const user = await h.mount({ seed: ["grant-expires", 1], page: "grant" });
    await screen.findByTestId("policy-pol-0001");
    await user.type(screen.getByTestId("advance-custom"), "61");
    await user.click(screen.getByTestId("advance-custom-go"));
    await waitFor(() => expect(screen.getByTestId("last-labinv")).toHaveTextContent(/Automatic expiry by a reaper/));
    expect(within(screen.getByTestId("last-labinv")).getByTestId("basis")).toHaveTextContent("lab-invented");
    expect(screen.getByTestId("drift-labinv").closest("[data-testid=reconcile-card]")).not.toBeNull();
    await user.click(screen.getByTestId("open-grant"));
    expect(await screen.findByTestId("durations-basis")).toHaveTextContent("lab-invented");
  });
});
