/** Local graph SVG → high-resolution PNG for Office paste and sharing. */
export function graphRasterDimensions(width:number,height:number,scale=2){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
  !Number.isSafeInteger(scale)||scale<1||scale>3||width*height*scale*scale>5_000_000)
  throw Error("Graph raster image exceeds the safe pixel budget.");
 return {width:width*scale,height:height*scale};
}
export async function graphToPng(svg:SVGSVGElement,width=780,height=470):Promise<Uint8Array>{
 if(svg.querySelector("foreignObject,script,image,iframe,video,a,[href],[xlink\\:href]"))
  throw Error("External or embedded SVG content is not permitted for graph export.");
 const size=graphRasterDimensions(width,height,2);
 const xml=new XMLSerializer().serializeToString(svg);
 if(xml.length>2_000_000)throw Error("Graph SVG is too large to rasterize.");
 const url=URL.createObjectURL(new Blob([xml],{type:"image/svg+xml;charset=utf-8"}));
 try{
  const image=new Image();
  await new Promise<void>((resolve,reject)=>{
   image.onload=()=>resolve();
   image.onerror=()=>reject(Error("Cannot decode local SVG graph."));
   image.src=url;
  });
  const canvas=document.createElement("canvas");
  canvas.width=size.width;canvas.height=size.height;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("No canvas encoder available.");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,size.width,size.height);
  ctx.drawImage(image,0,0,size.width,size.height);
  const blob=await new Promise<Blob>((resolve,reject)=>
   canvas.toBlob(result=>result?resolve(result):reject(Error("PNG encoder failed.")),"image/png"));
  if(blob.type!=="image/png")throw Error("Graph was not encoded as PNG.");
  const bytes=new Uint8Array(await blob.arrayBuffer());
  if(![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))
   throw Error("Encoded bytes are not a real PNG.");
  if(bytes.byteLength>20_000_000)throw Error("Graph PNG exceeds export size limit.");
  canvas.width=0;canvas.height=0;
  return bytes;
 }finally{URL.revokeObjectURL(url);}
}
