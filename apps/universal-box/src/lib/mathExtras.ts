export type Vector2 = { magnitude: number; angle: number };
export function vectorComponents(v: Vector2): {x:number;y:number} {
  if (!Number.isFinite(v.magnitude) || !Number.isFinite(v.angle)) throw new Error("Vector values must be finite.");
  const theta=v.angle*Math.PI/180;
  return {x:v.magnitude*Math.cos(theta),y:v.magnitude*Math.sin(theta)};
}
export function combineVectors(a: Vector2, b: Vector2, subtract = false) {
  const p=vectorComponents(a),q=vectorComponents(b),sign=subtract?-1:1;
  const x=p.x+sign*q.x, y=p.y+sign*q.y;
  return { x,y,magnitude:Math.hypot(x,y),angle:Math.atan2(y,x)*180/Math.PI };
}
/**
 * Common classroom convention: trailing zeros of whole numbers without a decimal
 * point are ambiguous and not counted as significant.
 */
export function significantFigures(source: string): number | null {
  const compact=source.trim().replace(/^[+-]/u,"");
  if(!/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/iu.test(compact))return null;
  const mantissa=compact.split(/e/iu)[0];
  const hasDot=mantissa.includes(".");
  let digits=mantissa.replace(".","");
  digits=digits.replace(/^0+/u,"");
  if(!hasDot)digits=digits.replace(/0+$/u,"");
  if(!digits)return hasDot ? (mantissa.split(".")[1]?.length||1) : 1;
  return digits.length;
}
export function roundSignificant(value: number, figures: number): string {
  if (!Number.isFinite(value) || !Number.isInteger(figures) || figures<1 || figures>15) throw new Error("Use 1–15 significant figures and a finite result.");
  return value.toPrecision(figures);
}
