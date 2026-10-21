/** User-initiated composition of existing REAL exporters into one offline project ZIP. */
import JSZip from "jszip";
import {markdownToDocx} from "./documentExport";
import {exportSlideDeck,type CreativeTheme,parseSlideOutline,renderFlowchartSvg} from "./creativeStudio";

export type ProjectPackInput={
 title:string;subtitle:string;outline:string;notes:string;theme:CreativeTheme;
};
export type ProjectPackPlan={title:string;sections:number;noteChars:number;filenames:string[]};
function validateText(text:string,label:string,max:number,needed:boolean):string{
 if(text.length>max)throw Error(label+" exceeds "+max+" characters.");
 if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text))throw Error(label+" contains unsupported control characters.");
 if(needed&&!text.trim())throw Error(label+" is required.");
 return text.trim();
}
export function planProjectPack(input:ProjectPackInput):ProjectPackPlan{
 const title=validateText(input.title,"Project title",100,true);
 validateText(input.subtitle,"Project subtitle",180,false);
 validateText(input.notes,"Project notes",12000,false);
 const slides=parseSlideOutline({title,subtitle:input.subtitle,outline:input.outline,theme:input.theme});
 return {title,sections:slides.length,noteChars:input.notes.length,filenames:[
  "project/brief.docx","project/slides.pptx","project/process.svg",
  "project/original-outline.md","project/README.txt","project/manifest.json",
 ]};
}
export async function buildProjectPack(input:ProjectPackInput):Promise<Uint8Array>{
 const plan=planProjectPack(input);
 const slides=parseSlideOutline({title:input.title,subtitle:input.subtitle,outline:input.outline,theme:input.theme});
 const headings=slides.map(s=>s.title);
 const markdown="# "+input.title+"\n\n"+(input.subtitle.trim()?input.subtitle.trim()+"\n\n":"")
  +"## Project outline\n\n"+input.outline.trim()+"\n\n"
  +(input.notes.trim()?"## Supporting notes\n\n"+input.notes.trim()+"\n":"");
 const [docx,pptx]=await Promise.all([
  markdownToDocx(markdown),
  exportSlideDeck({title:input.title,subtitle:input.subtitle,outline:input.outline,theme:input.theme}),
 ]);
 const graph=renderFlowchartSvg({
  title:plan.title,
  steps:headings.join("\n"),
  theme:input.theme,
 });
 const zip=new JSZip();
 zip.file("project/brief.docx",docx);
 zip.file("project/slides.pptx",pptx);
 zip.file("project/process.svg",graph);
 zip.file("project/original-outline.md",markdown);
 zip.file("project/README.txt","Sentinel Box free offline project pack\n"
  +"Open brief.docx in Word/LibreOffice and slides.pptx in PowerPoint/LibreOffice.\n"
  +"Edit process.svg in a vector editor. All outputs are newly generated, not uploaded.\n"
  +"Original input files are untouched. Review layouts in the target apps.\n");
 zip.file("project/manifest.json",JSON.stringify({
  schemaVersion:1,generator:"Sentinel Box (offline)",
  title:plan.title,sections:plan.sections,
  files:plan.filenames.filter(s=>!s.endsWith("manifest.json")),
  servicesUsed:[],
 },null,2));
 const output=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:5}});
 if(output.length>20_000_000)throw Error("Project bundle exceeds the 20 MB output limit.");
 return output;
}
