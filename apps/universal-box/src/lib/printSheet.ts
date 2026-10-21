/** Original local print layouts. No external SVG assets, scripts, or fonts. */
export type PrintTemplate="labels"|"cards"|"tickets";
export type PrintTheme="blue"|"green"|"purple";
export type PrintInput={template:PrintTemplate;theme:PrintTheme;title:string;items:string;footer:string};
const PALETTES={
 blue:{ink:"#123354",accent:"#2777b8",pale:"#eef6ff"},
 green:{ink:"#194438",accent:"#258971",pale:"#eafff5"},
 purple:{ink:"#4c2a68",accent:"#925bb5",pale:"#f8edff"}
} as const;
export const escapeSvgText=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
export function parsePrintItems(input:PrintInput):string[]{
 if(!Object.prototype.hasOwnProperty.call(PALETTES,input.theme))throw Error("Choose a valid palette.");
 if(!["labels","cards","tickets"].includes(input.template))throw Error("Choose a valid print format.");
 if(!input.title.trim()||input.title.length>80)throw Error("Title is required (up to 80 characters).");
 if(input.footer.length>110||input.items.length>5000)throw Error("Text exceeds the print limit.");
 const lines=input.items.replace(/\r\n?/gu,"\n").split("\n").map(s=>s.trim()).filter(Boolean);
 const limit=input.template==="labels"?24:input.template==="cards"?8:10;
 if(lines.length<1||lines.length>limit)throw Error("Provide 1–"+limit+" entries.");
 if(lines.some(s=>s.length>90))throw Error("Each entry must be 90 characters or fewer.");
 return lines;
}
function text(s:string,x:number,y:number,size:number,color:string,weight=400):string{
 return '<text x="'+x+'" y="'+y+'" font-family="Arial, sans-serif" font-size="'+size+
  '" fill="'+color+'" font-weight="'+weight+'" text-anchor="middle">'+escapeSvgText(s)+'</text>';
}
function wrap(s:string,limit:number,maxLines=3):string[]{
 let chars=Array.from(s);const lines:string[]=[];
 while(chars.length&&lines.length<maxLines){
  if(chars.length<=limit){lines.push(chars.join(""));chars=[];break;}
  let cut=limit;const prefix=chars.slice(0,limit).join("");const split=prefix.lastIndexOf(" ");
  if(split>Math.floor(limit/2))cut=split;
  lines.push(chars.slice(0,cut).join("").trim());
  chars=chars.slice(cut);while(chars[0]===" ")chars.shift();
 }
 if(chars.length&&lines.length===maxLines)throw Error("Entry is too long to fit without clipping.");
 return lines;
}
/** Real A4 (210 × 297 mm) SVG page with physical dimensions and cut guides. */
export function renderPrintSheet(input:PrintInput):string{
 const items=parsePrintItems(input),p=PALETTES[input.theme];
 const labels=input.template==="labels",cards=input.template==="cards";
 const columns=labels?3:2,rows=labels?8:cards?4:5;
 const w=labels?368:548,h=labels?190:cards?360:275;
 const gapX=labels?20:28,gapY=labels?13:22,areaW=columns*w+(columns-1)*gapX,areaH=rows*h+(rows-1)*gapY;
 const left=Math.round((1240-areaW)/2),top=Math.round((1754-areaH)/2);
 const pieces:string[]=[];
 for(let i=0;i<columns*rows;i++){
  const x=left+(i%columns)*(w+gapX),y=top+Math.floor(i/columns)*(h+gapY);
  pieces.push('<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+
   '" rx="'+(labels?9:18)+'" fill="'+(i<items.length?p.pale:"#ffffff")+
   '" stroke="'+(i<items.length?p.accent:"#d2d5da")+'" stroke-width="2" stroke-dasharray="'+(i<items.length?"0":"8 8")+'"/>');
  if(i>=items.length)continue;
  pieces.push('<rect x="'+(x+12)+'" y="'+(y+12)+'" width="'+(w-24)+'" height="6" fill="'+p.accent+'"/>');
  const font=labels?23:cards?35:29;
  const wrapped=wrap(items[i],labels?22:29,labels?2:3);
  wrapped.forEach((line,j)=>pieces.push(text(line,x+w/2,y+h*.43+(j-(wrapped.length-1)/2)*(font+8),font,p.ink,700)));
  if(!labels){
   pieces.push(text(input.title.slice(0,45),x+w/2,y+55,19,p.accent,700));
   if(input.footer)pieces.push(text(input.footer.slice(0,70),x+w/2,y+h-35,16,p.ink));
  }
 }
 return '<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 1240 1754">'
  +'<rect width="1240" height="1754" fill="#ffffff"/>'
  +text(input.title,620,Math.max(55,top-19),30,p.ink,700)
  +pieces.join("")+'</svg>';
}
