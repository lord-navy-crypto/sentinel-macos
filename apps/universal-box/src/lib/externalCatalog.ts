/** Curated official home pages only; these links are opened explicitly in the system browser. */
export type ExternalCategory="Documents"|"Math"|"Diagrams"|"Images"|"Research";
export type ExternalTool={
  id:string; name:string; category:ExternalCategory; url:string; description:string;
  note:string;
};
export const EXTERNAL_TOOLS:readonly ExternalTool[]=[
  {id:"pdf24",name:"PDF24 Tools",category:"Documents",url:"https://tools.pdf24.org/en/all-tools",
   description:"Broader PDF operations, including OCR, compression and editing.",
   note:"Online tools may process uploaded PDFs on remote servers; check privacy before sharing sensitive files."},
  {id:"zoterobib",name:"ZoteroBib",category:"Research",url:"https://zbib.org/",
   description:"Generate MLA, APA, Chicago and other bibliographies from research sources.",
   note:"Free bibliography builder. Review citation metadata before submitting assignments."},
  {id:"overleaf",name:"Overleaf",category:"Research",url:"https://www.overleaf.com/",
   description:"Collaborative LaTeX editing for long scientific papers.",
   note:"Online service with free and paid plans; account may be required."},
  {id:"desmos",name:"Desmos Graphing Calculator",category:"Math",url:"https://www.desmos.com/calculator",
   description:"Explore interactive functions, sliders and mathematical graphs.",
   note:"Opens online graphing tool. Account may be needed to save online work."},
  {id:"geogebra",name:"GeoGebra Calculator Suite",category:"Math",url:"https://www.geogebra.org/calculator",
   description:"Geometry, graphing, algebra and dynamic math exploration.",
   note:"Online interactive math environment."},
  {id:"wolfram",name:"Wolfram|Alpha",category:"Math",url:"https://www.wolframalpha.com/",
   description:"Explore mathematical and scientific computations beyond simple desktop modes.",
   note:"Some advanced features are paid and require online access."},
  {id:"diagrams",name:"diagrams.net (draw.io)",category:"Diagrams",url:"https://app.diagrams.net/",
   description:"Flowcharts, UML, network diagrams and process diagrams.",
   note:"Independent external editor; choose a suitable storage location."},
  {id:"excalidraw",name:"Excalidraw",category:"Diagrams",url:"https://excalidraw.com/",
   description:"Sketch quick hand-drawn style diagrams and visual explanations.",
   note:"External browser whiteboard; sharing/export policies belong to that service."},
  {id:"photopea",name:"Photopea",category:"Images",url:"https://www.photopea.com/",
   description:"Advanced layers, masking, PSD files and image adjustments.",
   note:"Third-party browser editor; some features and advertising may differ from Daily Desk."},
];
export function validatedExternalUrl(url:string):string {
  const parsed=new URL(url);
  if(parsed.protocol!=="https:"||parsed.username||parsed.password)throw new Error("Only secure HTTPS links are permitted.");
  return parsed.toString();
}
