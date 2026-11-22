import { describe, expect, it } from "vitest";
import { jsonResponse } from "./harness.js";
import { buildDiagram } from "../../../server/src/diagramData.js";
import { VERTICALS } from "../../../server/src/cast.js";
import { fireEvent, act } from "@testing-library/react";
import { LABEL_ID, LABEL_TEXT, nav, screen, useLabHarness, waitFor } from "./util.jsx";

const h = useLabHarness();
// The page talks to the lab server's REAL /api/diagram (rule 17: diagram-studio data loaded by name); the expectations come from the same data files.
const DATA = buildDiagram(VERTICALS.finance, "connect-and-link");
const GR = buildDiagram(VERTICALS.finance, "grant-and-revoke");
const N = DATA.steps.length;

describe("Diagram page (rules 5 and 17)", () => {
  it("loads the diagram BY NAME from the server and draws exactly the boxes and arrows the data lists", async () => {
    await h.mount({ page: "diagram" });
    await screen.findByTestId("pattern-canvas");
    const call = h.lab.calls.find((c) => c.path === "/api/diagram");
    expect(call.search).toMatch(/name=connect-and-link/);
    expect(call.search).toMatch(/vertical=finance/);
    for (const n of DATA.nodes) expect(screen.getByTestId(`pat-node-${n.id}`)).toHaveTextContent(n.label);
    expect(document.querySelectorAll(".react-flow__node").length).toBe(DATA.nodes.length);
    expect(document.querySelector("section.pat").textContent).not.toMatch(LABEL_TEXT);
  });

  it("switching the diagram loads the other one by name", async () => {
    const user = await h.mount({ page: "diagram" });
    await screen.findByTestId("pattern-canvas");
    await user.click(screen.getByTestId("dg-grant-and-revoke"));
    await waitFor(() => expect(h.lab.calls.filter((c) => c.path === "/api/diagram").at(-1).search).toMatch(/name=grant-and-revoke/));
    await screen.findByTestId("pattern-canvas");
  });

  it("Simulate walks the arrows (playing), Pause holds, Next and Prev step, the counter reads 'Arrow N of M'", async () => {
    const user = await h.mount({ page: "diagram" });
    await screen.findByTestId("pattern-canvas");
    expect(screen.getByTestId("step-caption")).toHaveTextContent(new RegExp(`Simulate walks the ${N} arrows`));
    await user.click(screen.getByTestId("simulate"));
    expect(screen.getByTestId("step-caption")).toHaveTextContent(`Arrow 1 of ${N}`);
    expect(screen.getByTestId("pattern-now")).toHaveTextContent(DATA.steps[0].say);
    expect(screen.getByTestId("pause")).toBeInTheDocument();
    await user.click(screen.getByTestId("pause"));
    expect(screen.getByTestId("resume")).toBeInTheDocument();
    await user.click(screen.getByTestId("next"));
    expect(screen.getByTestId("step-caption")).toHaveTextContent(`Arrow 2 of ${N}`);
    await user.click(screen.getByTestId("prev"));
    expect(screen.getByTestId("step-caption")).toHaveTextContent(`Arrow 1 of ${N}`);
    expect(screen.getByTestId("step-caption")).toHaveAttribute("aria-live", "polite");
  });

  it("Simulate really walks on its own at the chosen speed and stops paused on the last arrow", async () => {
    const user = await h.mount({ page: "diagram" });
    await screen.findByTestId("pattern-canvas");
    await user.selectOptions(screen.getByTestId("speed"), "fast");
    await user.click(screen.getByTestId("simulate"));
    await waitFor(() => expect(screen.getByTestId("step-caption")).toHaveTextContent(`Arrow ${N} of ${N}`), { timeout: 12000 });
    await waitFor(() => expect(screen.getByTestId("resume")).toBeInTheDocument(), { timeout: 2000 });
  });

  it("Next from a fresh page starts the walkthrough paused at arrow 1 (the controls are never disabled for want of a start)", async () => {
    const user = await h.mount({ page: "diagram" });
    await screen.findByTestId("pattern-canvas");
    for (const id of ["simulate", "prev", "next", "pattern-reset", "speed"]) expect(screen.getByTestId(id), id).not.toBeDisabled();
    await user.click(screen.getByTestId("next"));
    expect(screen.getByTestId("step-caption")).toHaveTextContent(`Arrow 1 of ${N}`);
    expect(screen.getByTestId("resume")).toBeInTheDocument(); // paused
  });

  it("has a speed control and Reset that stops the walkthrough and closes the detail", async () => {
    const user = await h.mount({ page: "diagram" });
    await screen.findByTestId("pattern-canvas");
    const speed = screen.getByTestId("speed");
    expect([...speed.options].map((o) => o.textContent)).toEqual(["Slow", "Normal", "Fast"]);
    await user.selectOptions(speed, "fast");
    expect(speed).toHaveValue("fast");
    await user.click(screen.getByTestId("simulate"));
    await user.click(screen.getByTestId("pattern-reset"));
    expect(screen.getByTestId("step-caption")).toHaveTextContent(new RegExp(`Simulate walks the ${N} arrows`));
    expect(screen.queryByTestId("pattern-now")).toBeNull();
    expect(screen.getByTestId("speed")).toHaveValue("fast"); // speed is a setting, not part of the walkthrough
  });

  it("the page's Reset restores the diagram too (a new epoch remounts it at its start)", async () => {
    const user = await h.mount({ page: "diagram" });
    await screen.findByTestId("pattern-canvas");
    await user.click(screen.getByTestId("simulate"));
    expect(screen.getByTestId("pattern-now")).toBeInTheDocument();
    await user.click(screen.getByTestId("reset"));
    await waitFor(() => expect(screen.queryByTestId("pattern-now")).toBeNull());
  });

  it("when the server answers that there is no such diagram the page says so with the server's message and draws nothing by hand", async () => {
    await h.mount({ overrides: { "/api/diagram": () => jsonResponse(404, { error: "unknown_diagram", message: "No such diagram. The diagrams are: connect-and-link, grant-and-revoke" }) }, page: "diagram" });
    const box = await screen.findByTestId("diagram-error");
    expect(box).toHaveTextContent("This diagram could not be loaded");
    expect(screen.getByTestId("diagram-error-text")).toHaveTextContent("No such diagram");
    expect(document.querySelector(".react-flow")).toBeNull();
  });

  it("diagram 2 is Grant and revoke: no reaper or reconcile-clears arrow, and no label chip on any arrow or step", async () => {
    const user = await h.mount({ page: "diagram" });
    await screen.findByTestId("pattern-canvas");
    await user.click(screen.getByTestId("dg-grant-and-revoke"));
    await waitFor(() => expect(screen.getByRole("region", { name: "Grant and revoke" })).toBeInTheDocument());
    expect(GR.steps.length).toBe(7);
    for (let i = 0; i < GR.steps.length; i += 1) {
      await user.click(screen.getByTestId("next"));
      expect(screen.getByTestId("pattern-now")).toHaveTextContent(GR.steps[i].label);
      expect(screen.queryByTestId(LABEL_ID("pattern-now-~"))).toBeNull();
    }
    const text = document.querySelector("section.pat").textContent;
    expect(text).not.toMatch(/reaper|reconcile clears|next reconcile|mixed/i); expect(text).not.toMatch(LABEL_TEXT);
    expect(screen.queryByTestId("mixed-tag")).toBeNull(); expect(screen.queryByTestId("claim-tag")).toBeNull();
  });

  it("a diagram of the wrong shape is refused rather than half drawn", async () => {
    await h.mount({ overrides: { "/api/diagram": () => jsonResponse(200, { title: "x" }) }, page: "diagram" });
    expect(await screen.findByTestId("diagram-error")).toBeInTheDocument();
  });

  it("a box is a keyboard button: Tab to it, Enter opens its details, Enter again closes them; a pan hint is in the page", async () => {
    const user = await h.mount({ page: "diagram" });
    await screen.findByTestId("pattern-canvas");
    expect(screen.getByTestId("pan-hint")).toHaveTextContent(/drag the background sideways to pan/);
    const box = screen.getByTestId("pat-node-priv");
    expect(box).toHaveAttribute("role", "button"); expect(box).toHaveAttribute("tabindex", "0");
    expect(box).toHaveAttribute("aria-expanded", "false");
    box.focus(); expect(document.activeElement).toBe(box);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByTestId("pat-node-priv")).toHaveAttribute("aria-expanded", "true"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByTestId("pat-node-priv")).toHaveAttribute("aria-expanded", "false"));
    await user.keyboard(" ");
    await waitFor(() => expect(screen.getByTestId("pat-node-priv")).toHaveAttribute("aria-expanded", "true"));
  });

  it("'#diagram/<name>' opens that diagram", async () => {
    window.location.hash = "#diagram/grant-and-revoke";
    await h.mount({});
    await screen.findByTestId("pattern-canvas");
    expect(h.lab.calls.filter((c) => c.path === "/api/diagram").at(-1).search).toMatch(/name=grant-and-revoke/);
  });
});
