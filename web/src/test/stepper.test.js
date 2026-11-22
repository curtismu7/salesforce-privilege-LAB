import { describe, expect, it } from "vitest";
import { initial, reduce, speedMs, SPEEDS } from "../stepper.js";

describe("stepper reducer (patterns section 8f)", () => {
  const run = (total, ...actions) => actions.reduce((s, a) => reduce(s, typeof a === "string" ? { type: a } : a), initial(total));
  it("starts off", () => expect(initial(4).step).toBe(-1));
  it("simulate starts at step 1 playing", () => expect(run(4, "simulate")).toMatchObject({ step: 0, paused: false }));
  it("Next from a fresh page starts PAUSED at step 1", () => expect(run(4, "next")).toMatchObject({ step: 0, paused: true }));
  it("Prev from a fresh page starts paused at step 1", () => expect(run(4, "prev")).toMatchObject({ step: 0, paused: true }));
  it("Next and Prev move one arrow and keep it paused", () => {
    expect(run(4, "next", "next", "next")).toMatchObject({ step: 2, paused: true });
    expect(run(4, "next", "next", "prev")).toMatchObject({ step: 0, paused: true });
    expect(run(4, "next", "next", "next", "next", "next")).toMatchObject({ step: 3 });
  });
  it("tick advances while playing, stops paused at the end, and does nothing when paused", () => {
    expect(run(3, "simulate", "tick")).toMatchObject({ step: 1 });
    expect(run(3, "simulate", "tick", "tick", "tick")).toMatchObject({ step: 2, paused: true });
    expect(run(3, "simulate", "pause", "tick")).toMatchObject({ step: 0, paused: true });
  });
  it("resume from the end goes back to step 1", () => expect(run(3, "simulate", "tick", "tick", "tick", "resume")).toMatchObject({ step: 0, paused: false }));
  it("stop returns to off; an empty diagram never starts", () => {
    expect(run(3, "simulate", "stop").step).toBe(-1);
    expect(run(0, "simulate", "next").step).toBe(-1);
  });
  it("speed: three settings, an unknown one is ignored, and a new total keeps the speed", () => {
    expect(SPEEDS.map((s) => s.id)).toEqual(["slow", "normal", "fast"]);
    expect(speedMs("fast")).toBeLessThan(speedMs("slow"));
    expect(run(3, { type: "speed", speed: "fast" }).speed).toBe("fast");
    expect(run(3, { type: "speed", speed: "warp" }).speed).toBe("normal");
    expect(reduce(run(3, { type: "speed", speed: "fast" }), { type: "total", total: 5 })).toMatchObject({ speed: "fast", total: 5, step: -1 });
  });
});
