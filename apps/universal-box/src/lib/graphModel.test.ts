import { describe, expect, it } from "vitest";
import { DEFAULT_WINDOW, panWindow, sampleGraph, validateWindow, zoomWindow } from "./graphModel";

describe("advanced offline graph model", () => {
  it("plots a Cartesian line and clips infinities", () => {
    const sections = sampleGraph({ first: "x^2" }, "cartesian", DEFAULT_WINDOW, -10, 10, 100);
    expect(sections).toHaveLength(1);
    expect(sections[0][50].y).toBeCloseTo(0, 8);
    expect(sampleGraph({ first: "1/x" }, "cartesian", DEFAULT_WINDOW, -10, 10, 100).every(part => part.every(p => Number.isFinite(p.y)))).toBe(true);
  });
  it("plots parametric unit circle and polar radius", () => {
    const parametric = sampleGraph({ first: "cos(t)", second: "sin(t)" }, "parametric", DEFAULT_WINDOW, 0, 2*Math.PI, 100);
    expect(parametric[0][0].x).toBeCloseTo(1);
    expect(parametric[0][0].y).toBeCloseTo(0);
    const polar = sampleGraph({ first: "2" }, "polar", DEFAULT_WINDOW, 0, 2*Math.PI, 100);
    expect(polar[0][0].x).toBeCloseTo(2);
  });
  it("zooms and pans without breaking the window", () => {
    const smaller = zoomWindow(DEFAULT_WINDOW, 0.5);
    expect(smaller.xMax-smaller.xMin).toBeCloseTo(10);
    expect(panWindow(smaller, 3, -2).xMin).toBeCloseTo(-2);
    expect(validateWindow({xMin:1,xMax:-1,yMin:0,yMax:1})).toBe(false);
  });
});
