/** Session-only explicit text collection. No background clipboard monitoring. */
export function addClip(items:string[], value:string):string[]{
  // Trim only for validation: keep user-intended indentation, spaces and line breaks.
  if(!value.trim()||value.length>20000)throw Error("Each clip must contain 1–20,000 characters.");
  if(items.length>=30)throw Error("Up to 30 clips can be collected.");
  if(items.reduce((n,s)=>n+s.length,0)+value.length>100000)throw Error("Combined clips exceed 100,000 characters.");
  return [...items,value];
}
export function combineClips(items:string[], separator:"newline"|"blank"|"space"):string{
  if(!items.length||items.length>30)throw Error("Add at least one clip (maximum 30).");
  const divider=separator==="newline"?"\n":separator==="blank"?"\n\n":separator==="space"?" ":null;
  if(divider===null)throw Error("Unsupported joining mode.");
  return items.join(divider);
}

/** Explicit reorder; never mutates previously captured snippets. */
export function moveClip(items:readonly string[],from:number,to:number):string[]{
  if(!Number.isInteger(from)||!Number.isInteger(to)||
    from<0||to<0||from>=items.length||to>=items.length)
    throw Error("Invalid clip move.");
  const result=[...items];
  const [item]=result.splice(from,1);
  result.splice(to,0,item);
  return result;
}
