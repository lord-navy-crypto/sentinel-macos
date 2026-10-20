import { describe, expect, it } from "vitest";
import { bisection, compileRealFunction, derivative, scanRoots, simpsonIntegral, tangent } from "./numericalAnalysis";

describe("desktop numerical analysis", () => {
  it("computes a derivative and tangent for x squared", () => {
    const f = compileRealFunction("x^2");
    expect(derivative(f, 3)).toBeCloseTo(6, 4);
    expect(tangent(f, 3).intercept).toBeCloseTo(-9, 4);
  });

  it("calculates definite integrals with Simpson's rule", () => {
    expect(simpsonIntegral(compileRealFunction("x^2"), 0, 3)).toBeCloseTo(9, 6);
    expect(simpsonIntegral(compileRealFunction("x"), 2, -2)).toBeCloseTo(0, 6);
  });

  it("finds roots and intersections for polynomial functions", () => {
    const roots = scanRoots(compileRealFunction("x^2-4"));
    expect(roots).toHaveLength(2);
    expect(roots[0]).toBeCloseTo(-2, 6);
    expect(roots[1]).toBeCloseTo(2, 6);
    const f = compileRealFunction("x^2");
    const g = compileRealFunction("x+2");
    const intersections = scanRoots(x => f(x) - g(x));
    expect(intersections).toHaveLength(2);
    expect(intersections[0]).toBeCloseTo(-1, 6);
    expect(intersections[1]).toBeCloseTo(2, 6);
  });

  it("does not report poles as real zeros", () => {
    const roots = scanRoots(compileRealFunction("1/x"), -1, 1);
    expect(roots).toEqual([]);
  });

  it("rejects invalid inputs and unbracketed roots", () => {
    expect(() => bisection(x => x * x + 1, -1, 1)).toThrow(/sign change/);
    expect(() => simpsonIntegral(x => x, Infinity, 2)).toThrow(/finite/);
    expect(() => compileRealFunction("")).toThrow(/Enter/);
  });
});
