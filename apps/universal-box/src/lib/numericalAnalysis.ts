import { compile } from "mathjs";

export type RealFunction = (x: number) => number;

export function compileRealFunction(expression: string): RealFunction {
  if (!expression.trim() || expression.length > 180) {
    throw new Error("Enter a function of x (maximum 180 characters).");
  }
  const formula = compile(expression);
  return (x: number) => {
    if (!Number.isFinite(x)) throw new Error("x must be finite.");
    const value: unknown = formula.evaluate({ x });
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("The function is not real and finite at x = " + x.toPrecision(5));
    }
    return value;
  };
}

export function derivative(f: RealFunction, x: number): number {
  if (!Number.isFinite(x)) throw new Error("x must be finite.");
  const h = Math.max(1e-5, 1e-5 * Math.abs(x));
  return (f(x + h) - f(x - h)) / (2 * h);
}

export function tangent(f: RealFunction, x: number) {
  const y = f(x);
  const slope = derivative(f, x);
  return { x, y, slope, intercept: y - slope * x };
}

export function simpsonIntegral(f: RealFunction, a: number, b: number, slices = 400): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 1e6 || Math.abs(b) > 1e6) {
    throw new Error("Integral bounds must be finite and within ±1,000,000.");
  }
  if (a === b) return 0;
  if (!Number.isInteger(slices) || slices < 2 || slices > 2000 || slices % 2 !== 0) {
    throw new Error("Simpson's rule needs an even number of slices, from 2 to 2000.");
  }
  const h = (b - a) / slices;
  let sum = f(a) + f(b);
  for (let i = 1; i < slices; i++) {
    sum += (i % 2 === 0 ? 2 : 4) * f(a + h * i);
  }
  return h * sum / 3;
}

export function bisection(f: RealFunction, a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b) throw new Error("Invalid root bracket.");
  let left = a, right = b, lValue = f(left), rValue = f(right);
  if (Math.abs(lValue) < 1e-10) return left;
  if (Math.abs(rValue) < 1e-10) return right;
  if (lValue * rValue >= 0) throw new Error("Root search needs a sign change.");
  for (let i = 0; i < 65; i++) {
    const mid = (left + right) / 2;
    const mValue = f(mid);
    if (Math.abs(mValue) < 1e-9 || right - left < 1e-9) return mid;
    if (lValue * mValue < 0) { right = mid; rValue = mValue; }
    else { left = mid; lValue = mValue; }
  }
  void rValue;
  return (left + right) / 2;
}

/**
 * Scan for sign-changing real roots only. Tangential roots (such as (x-1)^2)
 * may be missed unless sampled exactly; discontinuities are rejected when
 * the candidate does not actually evaluate near zero.
 */
export function scanRoots(f: RealFunction, min = -10, max = 10, steps = 400): number[] {
  if (!(min < max) || steps > 1000 || steps < 2) throw new Error("Invalid root interval.");
  const roots: number[] = [];
  const add = (x: number) => {
    if (roots.every(previous => Math.abs(previous - x) > 1e-4)) roots.push(x);
  };
  let previousX = min;
  let previousY: number | null;
  try { previousY = f(min); } catch { previousY = null; }
  for (let i = 1; i <= steps; i++) {
    const x = min + (max - min) * i / steps;
    let y: number | null;
    try { y = f(x); } catch { y = null; }
    if (previousY !== null && Math.abs(previousY) < 1e-8) add(previousX);
    if (y !== null && Math.abs(y) < 1e-8) add(x);
    if (previousY !== null && y !== null && previousY * y < 0) {
      try {
        const candidate = bisection(f, previousX, x);
        if (Math.abs(f(candidate)) < 1e-5) add(candidate);
      } catch { /* interrupted domain: do not report a false root */ }
    }
    previousX = x;
    previousY = y;
  }
  return roots.sort((a, b) => a - b).slice(0, 30);
}
