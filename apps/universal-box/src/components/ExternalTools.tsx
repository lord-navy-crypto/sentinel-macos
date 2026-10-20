import {useMemo,useState} from "react";
import {isTauri} from "@tauri-apps/api/core";
import {openUrl} from "@tauri-apps/plugin-opener";
import {EXTERNAL_TOOLS,validatedExternalUrl,type ExternalCategory} from "../lib/externalCatalog";

type Category="All"|ExternalCategory;
export default function ExternalTools({onOpenPresets}:{onOpenPresets:()=>void}){
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState<Category>("All");
  const [status,setStatus]=useState("");
  const categories:Category[]=["All","Documents","Math","Diagrams","Images","Research"];
  const filtered=useMemo(()=>EXTERNAL_TOOLS.filter(tool=>
    (category==="All"||tool.category===category)&&
    (tool.name+" "+tool.description+" "+tool.category).toLocaleLowerCase().includes(query.toLocaleLowerCase())
  ),[category,query]);
  async function openExternal(url:string){
    try{
      const safe=validatedExternalUrl(url);
      if(isTauri())await openUrl(safe);
      else {
        // noopener may intentionally return null even when the browser opened the tab.
        window.open(safe,"_blank","noopener,noreferrer");
      }
      setStatus("External website launch requested. Daily Desk has not sent any of your files.");
    }catch(error){setStatus("Could not open this link: "+String(error instanceof Error?error.message:error));}
  }
  return <section className="panel">
    <p className="eyebrow">EXTERNAL TOOLS · VERIFIED OFFICIAL WEBSITES</p>
    <h2>External Tools / 外部工具</h2>
    <p className="subtle">Use Daily Desk local features first. For professional editing, collaborative writing and tools that need internet services, explicitly open a third-party website in your default browser. No embedding, auto-login or silent uploads.</p>
    <div className="actions">
      <label className="field-label" htmlFor="external-query">Find external tool</label>
      <input className="field" id="external-query" value={query} onChange={e=>setQuery(e.target.value)} placeholder="PDF, drawing, equations, citations…"/>
      <label className="field-label" htmlFor="external-category">Category</label>
      <select id="external-category" className="field" value={category} onChange={e=>setCategory(e.target.value as Category)}>
        {categories.map(name=><option key={name} value={name}>{name}</option>)}
      </select>
    </div>
    <p className="subtle">{filtered.length} curated websites · Opens only on click · Online service terms, accounts and pricing may change.</p>
    <div className="tool-grid">
      {filtered.map(tool=><div key={tool.id} className="tool-card">
        <strong>{tool.name}</strong><span className="subtle">{tool.category} · {tool.description}</span>
        <span className="subtle">{tool.note}</span>
        <span className="subtle">{new URL(tool.url).hostname}</span>
        <button className="secondary-button" type="button" onClick={()=>{void openExternal(tool.url);}}>Open official website ↗</button>
      </div>)}
    </div>
    {filtered.length===0&&<p className="subtle">No matching websites. Try another search or category.</p>}
    <h3>Your own external shortcuts</h3>
    <p className="subtle">Keep arbitrary project URLs in Link Presets. Daily Desk stores those shortcuts locally rather than operating a redirect server.</p>
    <button className="secondary-button" type="button" onClick={onOpenPresets}>Open my Link Presets</button>
    {status&&<p role="status" className="subtle">{status}</p>}
  </section>;
}
