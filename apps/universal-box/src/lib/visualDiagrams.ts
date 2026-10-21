/** Original offline SVG mind-map and milestone timeline creation. */
export type DiagramPalette="ocean"|"forest"|"sunset";
export type DiagramMode="mindmap"|"timeline";
const COLORS={
 ocean:{bg:"#102a43",edge:"#60b6e7",node:"#e6f5ff",ink:"#183855"},
 forest:{bg:"#123f39",edge:"#75cbb5",node:"#edfff7",ink:"#19463f"},
 sunset:{bg:"#4a264d",edge:"#ecb4ce",node:"#fff1f6",ink:"#562447"},
} as const;
export type DiagramInput={title:string;items:string;theme:DiagramPalette;mode:DiagramMode};
export type DiagramNode={label:string;details:string[]};
const escapeXml=(x:string)=>x.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
 .replace(/"/g,"&quot;").replace(/'/g,"&apos;");
export function parseDiagram(input:DiagramInput):DiagramNode[]{
 if(!Object.prototype.hasOwnProperty.call(COLORS,input.theme))throw Error("Choose a valid theme.");
 if(input.title.length>70||!input.title.trim())throw Error("Title is required (up to 70 characters).");
 if(input.items.length>2500)throw Error("Too many diagram characters.");
 const rows=input.items.replace(/\r\n?/gu,"\n").split("\n").map(x=>x.trim()).filter(Boolean);
 if(!rows.length||rows.length>8)throw Error("Enter 1–8 topics or milestones.");
 return rows.map(s=>{
  const parts=s.split("|").map(v=>v.trim());
  if(parts[0].length>54||!parts[0])throw Error("Each topic must have a short label (up to 54 characters).");
  if(parts.length>4)throw Error("Maximum 3 details per topic.");
  if(parts.slice(1).some(x=>x.length>70))throw Error("Detail is too long.");
  return {label:parts[0],details:parts.slice(1).filter(Boolean)};
 });
}
const text=(x:number,y:number,s:string,size:number,color:string,anchor="middle",weight="400")=>
 '<text x="'+x+'" y="'+y+'" font-family="Arial, sans-serif" font-weight="'+weight
 +'" font-size="'+size+'" text-anchor="'+anchor+'" fill="'+color+'">'+escapeXml(s)+'</text>';
const rect=(x:number,y:number,w:number,h:number,color:string)=>
 '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="18" fill="'+color+'"/>';
export function renderDiagram(input:DiagramInput):string{
 const nodes=parseDiagram(input),p=COLORS[input.theme];
 if(input.mode!=="mindmap"&&input.mode!=="timeline")throw Error("Unknown diagram mode.");
 const timeline=input.mode==="timeline";
 const height=timeline?Math.max(520,200+nodes.length*118):Math.max(660,180+Math.ceil(nodes.length/2)*180);
 const width=1200,body:string[]=[];
 if(timeline){
  body.push('<path d="M 190 175 V '+(height-75)+'" stroke="'+p.edge+'" stroke-width="6"/>');
  nodes.forEach((n,i)=>{
   const y=175+i*118;
   body.push('<circle cx="190" cy="'+(y+30)+'" r="14" fill="'+p.edge+'"/>');
   body.push(rect(245,y,825,96,p.node));
   body.push(text(275,y+33,n.label,25,p.ink,"start","700"));
   body.push(text(275,y+69,n.details.join(" · "),18,p.ink,"start"));
  });
 }else{
  const cy=Math.floor(height/2);
  body.push(rect(430,cy-55,340,110,p.edge));
  body.push(text(600,cy+8,input.title,31,p.bg,"middle","700"));
  nodes.forEach((n,i)=>{
   const right=i%2===1;const column=Math.floor(i/2);
   const y=128+column*180;
   const x=right?805:40,w=355;
   body.push('<path d="M '+(right?770:430)+' '+cy+' C '+(right?790:410)+' '+cy+', '+(right?790:410)+' '+(y+50)+', '+(right?805:395)+' '+(y+50)+'" stroke="'+p.edge+'" stroke-width="4" fill="none"/>');
   body.push(rect(x,y,w,116,p.node));
   body.push(text(x+w/2,y+37,n.label,22,p.ink,"middle","700"));
   for(let j=0;j<n.details.length;j++)body.push(text(x+w/2,y+64+j*18,n.details[j],15,p.ink));
  });
 }
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'" width="'+width+'" height="'+height+'">'
 +'<rect width="100%" height="100%" fill="'+p.bg+'"/>'
 +(timeline?text(600,82,input.title,42,p.node,"middle","700"):"")
 +body.join("")+'</svg>';
}
