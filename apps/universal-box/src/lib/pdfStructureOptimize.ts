/** Explicit, bounded PDF structure repack with measured byte difference.
 * This is NOT raster/JPEG recompression, PDF/A preservation, signature support or guaranteed savings.
 */
import {PDFDocument} from "pdf-lib";
export type PdfOptimizeResult={
 originalBytes:number;candidateBytes:number;savedBytes:number;percent:number;pages:number;
 improved:boolean;optimized:Uint8Array|null;
 method:"pdf-lib object-stream structural repack";
 warning:string;
};
const WARNING="PDF restructuring can invalidate signatures, PDF/A requirements, attachments or advanced interactive features. Check appearance and functionality with a trusted PDF reader before using.";
export async function optimizePdfStructure(input:Uint8Array):Promise<PdfOptimizeResult>{
 if(input.length<100||input.length>15_000_000)throw Error("Choose an unencrypted PDF between 100 bytes and 15 MB.");
 // Signatures must not be altered by this structural rewrite. A lexical hint is intentionally conservative.
 const text=new TextDecoder("latin1").decode(input);
 if(/\/ByteRange\s*\[/u.test(text)||/\/Type\s*\/Sig(?:\s|[/>])/u.test(text))
  throw Error("This PDF may be digitally signed. Structural optimization is disabled to avoid invalidating signatures.");
 const doc=await PDFDocument.load(input,{updateMetadata:false});
 const count=doc.getPageCount();
 if(count<1||count>200)throw Error("Only 1–200 page PDFs are supported.");
 if(doc.getForm().getFields().length)throw Error("PDF contains form fields. Structural rewriting is disabled for interactive forms.");
 const boxes=doc.getPages().map(p=>({...p.getCropBox(),rotation:p.getRotation().angle}));
 const output=await doc.save({useObjectStreams:true,updateFieldAppearances:false,objectsPerTick:50});
 if(output.length>20_000_000)throw Error("Optimized PDF output exceeds 20 MB.");
 const verify=await PDFDocument.load(output,{updateMetadata:false});
 if(verify.getPageCount()!==count)throw Error("Verification failed: changed PDF page count.");
 const same=verify.getPages().every((p,i)=>{
  const b=p.getCropBox(),a=boxes[i];
  return b.width===a.width&&b.height===a.height&&b.x===a.x&&b.y===a.y&&p.getRotation().angle===a.rotation;
 });
 if(!same)throw Error("Verification failed: page geometry changed.");
 const candidateBytes=output.length,improved=candidateBytes<input.length;
 return {originalBytes:input.length,candidateBytes,savedBytes:Math.max(0,input.length-candidateBytes),
  percent:improved?Number(((input.length-candidateBytes)*100/input.length).toFixed(2)):0,
  pages:count,improved,optimized:improved?output:null,method:"pdf-lib object-stream structural repack",warning:WARNING};
}
