import { describe, expect, it } from "vitest";
import { VERTICALS } from "../../../server/src/cast.js";
import { LABEL_ID, LABEL_TEXT, screen, text, useLabHarness, userEvent, waitFor, within } from "./util.jsx";

const h = useLabHarness();
const C = VERTICALS.finance;

async function openGrant(user) {
  await user.click(await screen.findByTestId("open-grant"));
  return screen.findByTestId("grant-dialog");
}
const grant = async (user, setId, duration = "60") => {
  const dlg = screen.getByTestId("grant-dialog");
  await user.selectOptions(within(dlg).getByTestId("grant-set"), setId);
  await user.clear(within(dlg).getByTestId("grant-duration"));
  await user.type(within(dlg).getByTestId("grant-duration"), duration);
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
    expect(screen.queryByTestId("count-observed")).toBeNull();
    // again: the same set is already held
    const dlg2 = await openGrant(user);
    await user.selectOptions(within(dlg2).getByTestId("grant-set"), "ps-1");
    expect(within(dlg2).getByTestId("grant-hint")).toHaveTextContent("Already has this permission set");
    await user.click(within(dlg2).getByTestId("grant-submit"));
    expect(await within(dlg2).findByTestId("grant-refusal")).toHaveTextContent("already_has_permission_set: Already has this permission set");
  }, 30000);

  it("the grant dialog takes a duration in minutes, with no list of offered durations and no label chip", async () => {
    const user = await h.mount({ seed: ["grant-rules", 0], page: "grant" });
    const dlg = await openGrant(user);
    const dur = within(dlg).getByTestId("grant-duration");
    expect(dur.tagName).toBe("INPUT"); expect(dur).toHaveValue(60);
    expect(dlg).not.toHaveTextContent(/observed default|about a year/); expect(dlg.textContent).not.toMatch(LABEL_TEXT);
    await user.clear(dur); await user.type(dur, "0");
    expect(within(dlg).getByTestId("grant-submit")).toBeDisabled();
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
    await user.click(screen.getByTestId("reconcile"));
    await waitFor(() => expect(screen.getByTestId("no-policies")).toBeInTheDocument());
    expect(screen.getByTestId("ended-count")).toHaveTextContent("Expired / Revoked: 1 (pol-0001 revoked)");
    expect(text("receipt-status-rcpt-0001")).toBe("Revoked");
    expect(screen.getByTestId("assignments")).not.toHaveTextContent("Privilege policy"); // the integration user's own assignment stays
    expect(screen.getByTestId("assignments")).not.toHaveTextContent(C.castPermSet);
    expect(text("rec-line")).toMatch(/1 Expired \/ Revoked/);
  });

  it("nothing ends a grant by itself: moving the lab clock past the window leaves the policy, the receipt and the assignment", async () => {
    const user = await h.mount({ seed: ["revoke-by-delete", 1], page: "grant" });
    await screen.findByTestId("policy-pol-0001");
    await user.click(screen.getByTestId("advance-1440"));
    await waitFor(() => expect(text("clock-now")).toMatch(/2026-11-03/));
    expect(text("policy-status-pol-0001")).toBe("Active");
    expect(text("receipt-status-rcpt-0001")).toBe("Granted");
    expect(screen.getByTestId("assignments")).toHaveTextContent("Privilege policy");
    expect(screen.queryByTestId("reaper")).toBeNull();
    expect(screen.queryByTestId("hand-assign")).toBeNull();
    expect(screen.queryByTestId("advance-1052640")).toBeNull();
  }, 30000);

  it("a downstream failure (Privilege can no longer sign in) is a named refusal in the dialog, not a blank", async () => {
    const user = await h.mount({ seed: ["grant-rules", 0], page: "grant" });
    await h.lab.post("/api/actions", { op: "sf.setPermittedUsers", params: { policy: "self_authorize" }, vertical: "finance" });
    await user.click(await screen.findByTestId("grant-sync")); // reload the world (the Sync itself is refused)
    const dlg = await openGrant(user);
    await user.selectOptions(within(dlg).getByTestId("grant-set"), "ps-1");
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

  it("no label state on the page: the intro says only how access is removed, and Delete carries no marker", async () => {
    const user = await h.mount({ seed: ["revoke-by-delete", 1], page: "grant" });
    await screen.findByTestId("intro-observed");
    expect(screen.getByTestId("intro-observed")).toHaveTextContent("removed by deleting that policy");
    await user.click(screen.getByTestId("delete-pol-0001"));
    await waitFor(() => expect(text("policy-status-pol-0001")).toBe("Revoke pending, access still live"));
    const page = document.querySelector("main").textContent;
    expect(page).not.toMatch(LABEL_TEXT); expect(page).not.toMatch(/reaper|reconcile clears|next reconcile or Sync|discovered|orphaned/i);
    expect(screen.queryByTestId(LABEL_ID("note-~"))).toBeNull();
    expect(screen.getByTestId("last-action")).toHaveTextContent("policy.delete");
  });
});
