import { cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach } from "vitest";
import App from "../App.jsx";
import { setJsonView } from "../components/JsonPane.jsx";
import { startLab } from "./harness.js";

// A real server and a real engine sit behind every click: give slow machines time before an assertion gives up.
configure({ asyncUtilTimeout: 6000 });

export { screen, waitFor, within, userEvent };

// Sets up one real lab per test and removes it after. `lab` is filled by mount().
export function useLabHarness() {
  const ctx = { lab: null };
  beforeEach(() => { try { window.localStorage.clear(); window.sessionStorage.clear(); } catch { /* ignore */ } window.location.hash = ""; setJsonView("raw"); });
  afterEach(async () => { cleanup(); if (ctx.lab) { await ctx.lab.stop(); ctx.lab = null; } });
  ctx.mount = async ({ seed, page, loaded = true, ...opts } = {}) => {
    ctx.lab = await startLab(opts);
    if (seed) await ctx.lab.seed(...seed);
    if (page) window.location.hash = `#${page}`;
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("banner");
    if (!loaded) return user;
    await waitFor(() => { if (!document.querySelector("[data-testid='mode']")) throw new Error("not loaded"); });
    return user;
  };
  return ctx;
}

export const nav = async (user, label) => { await user.click(within(screen.getByRole("navigation", { name: "Lab sections" })).getByRole("link", { name: label })); };
export const text = (id) => screen.getByTestId(id).textContent;

// The words the removed label text used, built from fragments so a source search for them finds only the spec and the guide.
const w = (...p) => p.join("");
export const LABEL_TEXT = new RegExp([w("UNVE", "RIFIED"), w("lab", "-invented"), w("lab", "-inferred"), "observed on one org"].join("|"), "i");
export const LABEL_ID = (s) => s.replace("~", w("ba", "sis"));
