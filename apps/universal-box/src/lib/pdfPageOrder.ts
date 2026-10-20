/** One-based PDF page sequence for non-destructive reorder / remove operations. */
export function parsePdfOrder(text:string, count:number):number[]{
  if(!Number.isSafeInteger(count)||count<1||count>3000)throw new Error("Unsupported PDF page count.");
  const results:number[]=[];
  const used=new Set<number>();
  for(const item of text.split(",")){
    const part=item.trim();
    if(!part)continue;
    const range=/^(\d+)(?:-(\d+))?$/u.exec(part);
    if(!range)throw new Error("Use a sequence like 3,1,2,5-8. Every page can appear once.");
    const a=Number(range[1]),b=range[2]?Number(range[2]):a;
    if(a<1||b>count||a>b)throw new Error("Page out of bounds or invalid range.");
    for(let n=a;n<=b;n++){
      if(used.has(n))throw new Error("Page "+n+" appears more than once.");
      used.add(n);results.push(n-1);
    }
  }
  if(!results.length)throw new Error("Keep at least one page.");
  return results;
}
