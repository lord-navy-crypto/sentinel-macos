export function baseConvert(text: string, from: number, to: number): string {
  if (![from, to].every(b => Number.isInteger(b) && b >= 2 && b <= 36)) throw new Error("Base must be between 2 and 36.");
  const clean = text.trim().toLowerCase().replace(/^\+/u, "");
  if (!/^-?[0-9a-z]+$/u.test(clean) || clean.length > 40) throw new Error("Enter a valid integer (max 40 characters).");
  const negative = clean.startsWith("-");
  let n = 0n;
  for (const digit of (negative ? clean.slice(1) : clean)) {
    const value = parseInt(digit, 36);
    if (value >= from) throw new Error("Digit is invalid for this base.");
    n = n * BigInt(from) + BigInt(value);
  }
  return (negative ? -n : n).toString(to).toUpperCase();
}

export function quadraticRoots(a:number,b:number,c:number):string[] {
  if (![a,b,c].every(Number.isFinite))throw new Error("Coefficients must be finite.");
  if(a===0) {
    if(b===0) throw new Error("This is not an equation with one unique root.");
    return [String(-c/b)];
  }
  const d=b*b-4*a*c;
  if(d>=0) {
    const sqrt=Math.sqrt(d);
    return [(-b+sqrt)/(2*a),(-b-sqrt)/(2*a)].map(String);
  }
  return [(-b/(2*a)).toPrecision(7) + " + " + (Math.sqrt(-d)/(2*Math.abs(a))).toPrecision(7) + "i",
          (-b/(2*a)).toPrecision(7) + " - " + (Math.sqrt(-d)/(2*Math.abs(a))).toPrecision(7) + "i"];
}

export function descriptiveStats(values:number[]) {
  if(values.length===0||values.length>3000||values.some(v=>!Number.isFinite(v))) throw new Error("Enter 1–3000 finite numbers.");
  const n=values.length;
  const mean=values.reduce((s,x)=>s+x,0)/n;
  const sumSq=values.reduce((s,x)=>s+(x-mean)**2,0);
  const sorted=[...values].sort((a,b)=>a-b);
  const median=(sorted[Math.floor((n-1)/2)] + sorted[Math.floor(n/2)])/2;
  return {n,mean,median,min:sorted[0],max:sorted[n-1],sampleSd:n>1?Math.sqrt(sumSq/(n-1)):null,populationSd:Math.sqrt(sumSq/n)};
}

export function twoByTwo(a:number,b:number,c:number,d:number,e:number,f:number) {
  if(![a,b,c,d,e,f].every(Number.isFinite))throw new Error("Matrix values must be finite.");
  const det=a*d-b*c;
  if(Math.abs(det)<1e-12)throw new Error("Singular or nearly singular matrix.");
  return {x:(e*d-b*f)/det,y:(a*f-e*c)/det,det};
}
