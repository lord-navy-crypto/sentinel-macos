import {type PointerEvent,useEffect,useRef,useState} from "react";
import {exportFile} from "../lib/output";
import {ASPECTS,centeredCrop,moveCrop,pixelCrop,resizeCrop,type CropAspect,type CropBox} from "../lib/cropGeometry";

const CAP_PIXELS=20_000_000;
const ASPECT_NAMES:CropAspect[]=["free","1:1","4:3","16:9","3:2"];
function fileBase(file:File){
 return file.name.replace(/\.[^.]+$/u,"").replace(/[^\p{L}\p{N}._-]+/gu,"-").slice(0,55)||"image";
}
export default function InteractiveCropDesk({file}:{file:File|null}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const source=useRef<HTMLImageElement|null>(null);
 const pointer=useRef<{startX:number;startY:number;box:CropBox}|null>(null);
 const [dimensions,setDimensions]=useState({width:0,height:0});
 const [angle,setAngle]=useState<0|90|180|270>(0);
 const [aspect,setAspect]=useState<CropAspect>("free");
 const [crop,setCrop]=useState<CropBox>({x:.1,y:.1,w:.8,h:.8});
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);

 useEffect(()=>{
  let live=true;
  source.current=null;setReady(false);setStatus("");setAngle(0);setAspect("free");
  setDimensions({width:0,height:0});setCrop({x:.1,y:.1,w:.8,h:.8});
  if(!file)return;
  if(file.size>8_000_000){setStatus("Maximum input file size: 8 MB.");return;}
  if(!/^image\/(png|jpeg|webp)$/u.test(file.type)){setStatus("Choose PNG, JPEG or WebP.");return;}
  const url=URL.createObjectURL(file);
  const img=new Image();
  img.onload=()=>{
   if(!live)return;
   if(img.naturalWidth*img.naturalHeight>CAP_PIXELS){setStatus("Maximum image size: 20 megapixels.");return;}
   source.current=img;
   setDimensions({width:img.naturalWidth,height:img.naturalHeight});
   setReady(true);
  };
  img.onerror=()=>{if(live)setStatus("Could not decode image.");};
  img.src=url;
  return()=>{live=false;source.current=null;URL.revokeObjectURL(url);};
 },[file]);

 const imageWidth=(angle===90||angle===270)?dimensions.height:dimensions.width;
 const imageHeight=(angle===90||angle===270)?dimensions.width:dimensions.height;
 useEffect(()=>{
  if(!ready||!source.current||!canvas.current)return;
  const img=source.current,element=canvas.current;
  const scale=Math.min(1,720/imageWidth,720/imageHeight);
  element.width=Math.max(1,Math.round(imageWidth*scale));
  element.height=Math.max(1,Math.round(imageHeight*scale));
  const ctx=element.getContext("2d");
  if(!ctx){setStatus("Canvas unavailable.");return;}
  ctx.clearRect(0,0,element.width,element.height);
  ctx.save();
  ctx.translate(element.width/2,element.height/2);
  ctx.rotate(angle*Math.PI/180);
  ctx.drawImage(img,-dimensions.width*scale/2,-dimensions.height*scale/2,dimensions.width*scale,dimensions.height*scale);
  ctx.restore();
 },[angle,dimensions,ready,imageWidth,imageHeight]);

 function changeAspect(next:CropAspect){
  if(!ready)return;
  setAspect(next);
  setCrop(centeredCrop(imageWidth,imageHeight,next));
 }
 function rotate(){
  const next=((angle+90)%360) as 0|90|180|270;
  setAngle(next);
  const width=next===90||next===270?dimensions.height:dimensions.width;
  const height=next===90||next===270?dimensions.width:dimensions.height;
  setCrop(centeredCrop(width,height,aspect));
 }
 function pointerPos(event:PointerEvent<HTMLDivElement>){
  const bounds=event.currentTarget.getBoundingClientRect();
  return {x:(event.clientX-bounds.left)/bounds.width,y:(event.clientY-bounds.top)/bounds.height};
 }
 function startDrag(event:PointerEvent<HTMLDivElement>){
  if(!ready)return;
  const point=pointerPos(event);
  if(point.x<crop.x||point.x>crop.x+crop.w||point.y<crop.y||point.y>crop.y+crop.h)return;
  pointer.current={startX:point.x,startY:point.y,box:crop};
  event.currentTarget.setPointerCapture(event.pointerId);
 }
 function drag(event:PointerEvent<HTMLDivElement>){
  if(!pointer.current)return;
  const point=pointerPos(event);
  setCrop(moveCrop(pointer.current.box,point.x-pointer.current.startX,point.y-pointer.current.startY));
 }
 function endDrag(event:PointerEvent<HTMLDivElement>){
  pointer.current=null;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 }
 async function saveCrop(){
  if(!file||!source.current||!ready||busy)return;
  setBusy(true);setStatus("");
  try{
   const rect=pixelCrop(crop,imageWidth,imageHeight);
   if(rect.width*rect.height>CAP_PIXELS)throw Error("Crop output exceeds 20 megapixels.");
   const out=document.createElement("canvas");
   out.width=rect.width;out.height=rect.height;
   const ctx=out.getContext("2d");
   if(!ctx)throw Error("Canvas unavailable");
   ctx.translate(-rect.left,-rect.top);
   ctx.translate(imageWidth/2,imageHeight/2);
   ctx.rotate(angle*Math.PI/180);
   ctx.drawImage(source.current,-dimensions.width/2,-dimensions.height/2,dimensions.width,dimensions.height);
   const blob=await new Promise<Blob>((resolve,reject)=>out.toBlob(b=>b?resolve(b):reject(Error("PNG encoding failed.")),"image/png"));
   const ok=await exportFile(fileBase(file)+"-cropped.png",new Uint8Array(await blob.arrayBuffer()));
   setStatus(ok?"Saved a "+rect.width+" × "+rect.height+" pixel PNG. Original image unchanged.":"Save cancelled.");
  }catch(e){setStatus("Crop export failed: "+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 return <section className="panel">
  <h3>Interactive crop · 拖动裁剪区域</h3>
  <p className="subtle">Drag the blue rectangle across the image, select a fixed aspect ratio, rotate by 90° or adjust dimensions. Export uses full source resolution, not thumbnail pixels.</p>
  {!file&&<p className="subtle">Choose a PNG, JPEG or WebP image above.</p>}
  <div className="actions">
   {ASPECT_NAMES.map(id=><button key={id} disabled={!ready} className={aspect===id?"primary-button":"secondary-button"} type="button" onClick={()=>changeAspect(id)}>{id==="free"?"Free":id}</button>)}
   <button className="secondary-button" disabled={!ready} type="button" onClick={rotate}>Rotate 90°</button>
   <button className="secondary-button" disabled={!ready} type="button" onClick={()=>setCrop(centeredCrop(imageWidth,imageHeight,aspect))}>Reset crop</button>
  </div>
  {ready&&<div className="tools-pair">
    <label className="field-label">Crop width · {Math.round(crop.w*100)}%
      <input type="range" className="field" min={5} max={100} value={Math.round(crop.w*100)} onChange={e=>setCrop(prev=>resizeCrop(prev,"width",Number(e.target.value)/100,imageWidth,imageHeight,aspect))}/>
    </label>
    <label className="field-label">Crop height · {Math.round(crop.h*100)}%
      <input type="range" className="field" min={5} max={100} disabled={ASPECTS[aspect]!==null} value={Math.round(crop.h*100)} onChange={e=>setCrop(prev=>resizeCrop(prev,"height",Number(e.target.value)/100,imageWidth,imageHeight,aspect))}/>
    </label>
  </div>}
  <div style={{overflowX:"auto",padding:"10px 0"}}>
   <div onPointerDown={startDrag} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={endDrag}
     style={{position:"relative",display:"inline-block",maxWidth:"100%",touchAction:"none",cursor:ready?"move":"default",userSelect:"none"}}>
    <canvas ref={canvas} aria-label="Photo with draggable blue crop selection" style={{display:"block",maxWidth:"100%",height:"auto",background:"#f1f5f9",borderRadius:6}}/>
    {ready&&<div aria-hidden="true" style={{position:"absolute",left:(crop.x*100)+"%",top:(crop.y*100)+"%",
       width:(crop.w*100)+"%",height:(crop.h*100)+"%",border:"3px solid #2563eb",
       boxSizing:"border-box",boxShadow:"0 0 0 9999px #0f172a40",pointerEvents:"none"}}/>}
   </div>
  </div>
  <div className="actions">
   <span className="subtle">Source: {dimensions.width} × {dimensions.height} · Rotated: {imageWidth} × {imageHeight}</span>
   <button className="primary-button" disabled={!ready||busy} type="button" onClick={()=>{void saveCrop();}}>{busy?"Saving…":"Save full-resolution crop PNG"}</button>
  </div>
  {status&&<p className="subtle" role="status">{status}</p>}
 </section>;
}
