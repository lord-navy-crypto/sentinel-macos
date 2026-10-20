import { compile } from "mathjs";

export type GraphMode = "cartesian" | "parametric" | "polar";
export type GraphCurve = { first: string; second?: string };
export type GraphPoint = { x: number; y: number };
export type GraphWindow = { xMin: number; xMax: number; yMin: number; yMax: number };
export const DEFAULT_WINDOW: GraphWindow = { xMin: -10, xMax: 10, yMin: -6, yMax: 6 };

function numericResult(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function validateWindow(window: GraphWindow): boolean {
  return [window.xMin, window.xMax, window.yMin, window.yMax].every(Number.isFinite) &&
    window.xMax > window.xMin && window.yMax > window.yMin &&
    window.xMax - window.xMin > 1e-8 && window.yMax - window.yMin > 1e-8;
}

export function sampleGraph(
  curve: GraphCurve,
  mode: GraphMode,
  window: GraphWindow,
  minParameter: number,
  maxParameter: number,
  steps = 700,
): GraphPoint[][] {
  if (!validateWindow(window)) throw new Error("Invalid graph window.");
  if (curve.first.length > 160 || (curve.second ?? "").length > 160) throw new Error("Expression is too long.");
  if (!curve.first.trim()) return [];
  if (!Number.isFinite(minParameter) || !Number.isFinite(maxParameter) || minParameter >= maxParameter) throw new Error("Invalid parameter bounds.");
  if (!Number.isInteger(steps) || steps < 10 || steps > 1200) throw new Error("Invalid graph resolution.");
  const a = compile(curve.first);
  const b = mode === "parametric" ? compile(curve.second || "t") : null;
  const segments: GraphPoint[][] = [];
  let current: GraphPoint[] = [];
  const push = () => { if (current.length > 1) segments.push(current); current = []; };
  const ySpan = window.yMax - window.yMin;

  for (let i = 0; i <= steps; i++) {
    const parameter = mode === "cartesian"
      ? window.xMin + (window.xMax - window.xMin) * i / steps
      : minParameter + (maxParameter - minParameter) * i / steps;
    try {
      const scope = mode === "cartesian" ? { x: parameter } : { t: parameter, theta: parameter };
      const first = numericResult(a.evaluate(scope));
      const second = b ? numericResult(b.evaluate(scope)) : null;
      if (first === null || (b && second === null)) { push(); continue; }
      const point: GraphPoint = mode === "cartesian"
        ? { x: parameter, y: first }
        : mode === "polar"
          ? { x: first * Math.cos(parameter), y: first * Math.sin(parameter) }
          : { x: first, y: second! };
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
          Math.abs(point.x) > 1e7 || Math.abs(point.y) > 1e7) { push(); continue; }
      // Guard against a false line connecting both sides of a pole.
      if (current.length && mode === "cartesian" && Math.abs(point.y - current[current.length - 1].y) > ySpan * 1.5) push();
      current.push(point);
    } catch { push(); }
  }
  push();
  return segments;
}

export function zoomWindow(window: GraphWindow, factor: number): GraphWindow {
  if (!validateWindow(window) || !Number.isFinite(factor) || factor <= 0) throw new Error("Invalid zoom factor.");
  const x = (window.xMax + window.xMin) / 2, y = (window.yMax + window.yMin) / 2;
  const dx = (window.xMax - window.xMin) * factor / 2, dy = (window.yMax - window.yMin) * factor / 2;
  return { xMin: x - dx, xMax: x + dx, yMin: y - dy, yMax: y + dy };
}

export function panWindow(window: GraphWindow, deltaX: number, deltaY: number): GraphWindow {
  if (![deltaX, deltaY].every(Number.isFinite)) throw new Error("Invalid pan.");
  return { xMin: window.xMin + deltaX, xMax: window.xMax + deltaX, yMin: window.yMin + deltaY, yMax: window.yMax + deltaY };
}
