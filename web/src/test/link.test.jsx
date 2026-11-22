import { describe, expect, it } from "vitest";
import { VERTICALS } from "../../../server/src/cast.js";
import { screen, text, useLabHarness, waitFor, within } from "./util.jsx";

const h = useLabHarness();
const C = VERTICALS.finance;

describe("Link page", () => {
  it("before the application exists: Sync is off and says where to go, Add Users is off", async () => {
    await h.mount({ page: "link" });
    expect(await screen.findByTestId("sync")).toBeDisabled();
    expect(screen.getByTestId("no-app")).toHaveTextContent(/Create the application first/);
    expect(screen.getByTestId("add-pu-a")).toBeDisabled();
    expect(screen.getByTestId("seats-text")).toHaveTextContent("3 of 4 Salesforce user seats used, 1 free.");
  });

  it("shows Privilege users and Salesforce users side by side, with the shared email and the read-only marks", async () => {
    await h.mount({ seed: ["duplicate-email", 0], page: "link" });
    const pu = await screen.findByTestId("privilege-users");
    const sf = screen.getByTestId("salesforce-users");
    expect(within(pu).getAllByText("shared email")).toHaveLength(2);
    expect(within(pu).getAllByText("read-only").length).toBe(6);
    expect(within(sf).getByTestId("sfu-sfu-1")).toHaveTextContent(C.castAdminUsername);
    expect(screen.getByTestId("no-rows")).toHaveTextContent("Users (0)");
  });

  it("Add Users puts a row 'Waiting for Salesforce'; Sync links the one whose email is unique", async () => {
    const user = await h.mount({ seed: ["duplicate-email", 0], page: "link" });
    await user.click(await screen.findByTestId("add-pu-a"));
    await waitFor(() => expect(screen.getByTestId("pu-pu-a")).toHaveAttribute("data-status", "waiting"));
    expect(screen.getByTestId("pu-pu-a")).toHaveTextContent("Waiting for Salesforce");
    expect(screen.getByTestId("add-pu-a")).toBeDisabled();
    await user.click(screen.getByTestId("sync"));
    await waitFor(() => expect(screen.getByTestId("pu-pu-a")).toHaveAttribute("data-status", "linked"));
    expect(screen.getByTestId("pu-pu-a")).toHaveTextContent(`Linked to ${C.castAName}`);
    expect(screen.getByTestId("sync")).toHaveTextContent("Sync"); // still the one primary action
  });

  it("two Privilege records with one email: neither links, and the row says exactly 'its email matches 2 Privilege users'", async () => {
    const user = await h.mount({ seed: ["duplicate-email", 0], page: "link" });
    await user.click(await screen.findByTestId("add-pu-dup1"));
    await waitFor(() => expect(screen.getByTestId("pu-pu-dup1")).toHaveAttribute("data-status", "waiting"));
    await user.click(screen.getByTestId("add-pu-dup2"));
    await waitFor(() => expect(screen.getByTestId("pu-pu-dup2")).toHaveAttribute("data-status", "waiting"));
    await user.click(screen.getByTestId("sync"));
    await waitFor(() => expect(screen.getByTestId("reason-pu-dup1")).toHaveTextContent("its email matches 2 Privilege users"));
    expect(screen.getByTestId("reason-pu-dup1")).toHaveTextContent("Not linked: its email matches 2 Privilege users");
    expect(screen.getByTestId("reason-pu-dup2")).toHaveTextContent("its email matches 2 Privilege users");
    expect(screen.getByTestId("pu-pu-dup1")).toHaveTextContent("Not linked");
    expect(screen.getByTestId("pu-pu-dup1")).toHaveAttribute("data-status", "waiting");
  });

  it("a Federation ID is shown as NOT rescuing a mismatch; the row stays waiting and says so", async () => {
    await h.mount({ seed: ["link-pitfalls", 5], page: "link" });
    const sfu = await screen.findByTestId("sfu-sfu-4");
    expect(within(sfu).getByTestId("fed-chip-sfu-4")).toHaveTextContent("does not rescue a mismatch");
    expect(screen.getByTestId("pu-pu-f")).toHaveAttribute("data-status", "waiting");
    expect(screen.getByTestId("reason-pu-f")).toHaveTextContent(/Waiting for Salesforce: no Salesforce user has this exact email/);
    expect(screen.getByTestId("reason-pu-f")).toHaveTextContent(/Federation ID did not override this/);
    expect(screen.getByTestId("fed-note")).toHaveTextContent(/did not rescue an email mismatch/);
  });

  it("licence seats (4): the fourth is used, then 'No Salesforce licenses available' is shown; deactivating frees one", async () => {
    const user = await h.mount({ seed: ["link-pitfalls", 5], page: "link" });
    await screen.findByTestId("seats");
    expect(text("seats-text")).toBe("4 of 4 Salesforce user seats used, 0 free.");
    expect(screen.getByTestId("seats")).toHaveTextContent(/no seats left/);
    expect(screen.getByRole("img", { name: "4 of 4 seats used" })).toBeInTheDocument();
    await user.type(screen.getByTestId("nu-name"), C.castCName);
    await user.type(screen.getByTestId("nu-email"), C.castCEmail);
    await user.type(screen.getByTestId("nu-username"), C.castCUsername);
    await user.click(screen.getByTestId("create-user"));
    expect(await screen.findByTestId("last-refusal")).toHaveTextContent("No Salesforce licenses available");
    await user.click(screen.getByTestId("deactivate-sfu-4"));
    await waitFor(() => expect(text("seats-text")).toBe("3 of 4 Salesforce user seats used, 1 free."));
    await user.click(screen.getByTestId("create-user"));
    await waitFor(() => expect(text("seats-text")).toBe("4 of 4 Salesforce user seats used, 0 free."));
    // and the new user links on the next Sync once added in Privilege
    await user.click(screen.getByTestId("add-pu-c"));
    await user.click(screen.getByTestId("sync"));
    await waitFor(() => expect(screen.getByTestId("pu-pu-c")).toHaveAttribute("data-status", "linked"));
  }, 30000);

  it("a Salesforce Username taken in another org is refused: 'Duplicate username'", async () => {
    const user = await h.mount({ seed: ["link-pitfalls", 0], page: "link" });
    await screen.findByTestId("salesforce-users");
    await user.type(screen.getByTestId("nu-name"), C.castFName);
    await user.type(screen.getByTestId("nu-email"), C.castFSfEmail);
    await user.type(screen.getByTestId("nu-username"), C.castTakenUsername);
    await user.click(screen.getByTestId("create-user"));
    expect(await screen.findByTestId("last-refusal")).toHaveTextContent("Duplicate username");
    expect(screen.getByTestId("last-action")).toHaveTextContent("duplicate_username");
  });

  it("hostile text in a name is shown as inert text: no markup, no script, control and bidi characters as visible escapes", async () => {
    const user = await h.mount({ seed: ["link-pitfalls", 0], page: "link" });
    await screen.findByTestId("salesforce-users");
    const name = "<img src=x onerror=alert(1)> ‮reversed​";
    await user.type(screen.getByTestId("nu-name"), "<img src=x onerror=alert(1)> ‮reversed", { skipAutoClose: true });
    await user.type(screen.getByTestId("nu-email"), "x@fabrikam.example");
    await user.type(screen.getByTestId("nu-username"), "hostile@fabrikam-dev-ed.example");
    await user.click(screen.getByTestId("create-user"));
    const row = await screen.findByTestId("sfu-sfu-4");
    expect(row.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(document.querySelector("img")).toBeNull();
    expect(row.textContent).not.toContain("‮"); // never raw: stripped by the server or escaped by the page
  });

  it("email cells carry the no-wrap class so an address never breaks mid-word, and the wide tables sit in a scroll box", async () => {
    await h.mount({ seed: ["duplicate-email", 0], page: "link" });
    await screen.findByTestId("privilege-users");
    const emails = document.querySelectorAll("td.email");
    expect(emails.length).toBeGreaterThanOrEqual(8); // six Privilege users and the Salesforce users
    for (const td of emails) expect(td.textContent).toMatch(/@/);
    for (const tbl of document.querySelectorAll(".tbl--wide, .tbl--xwide")) expect(tbl.parentElement.className).toBe("scroll");
  });
});
