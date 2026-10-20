import {useEffect,useMemo,useState} from "react";
import katex from "katex";
import {FORMULA_BOARD} from "../lib/formulaBoard";
import {exportFile} from "../lib/output";
import "katex/dist/katex.min.css";

const STORAGE_KEY="daily-desk-formula-favs-v1";
type FormulaMode="latex"|"plain";
export default function FormulaBoardDesk(){
 const [category,setCategory]=useState(FORMULA_BOARD[0]?.id??"physics");
 const [query,setQuery]=useState("");
 const [mode,setMode]=useState<FormulaMode>("latex");
 const [favorites,setFavorites]=useState<string[]>([]);
 const [onlyFavorites,setOnlyFavorites]=useState(false);
 const [status,setStatus]=useState("");
 useEffect(()=>{
  try{
   const raw=localStorage.getItem(STORAGE_KEY);
   const items:unknown=raw?JSON.parse(raw):[];
   if(Array.isArray(items))setFavorites(items.filter((s):s is string=>typeof s==="string").slice(0,200));
  }catch{/* app storage may be unavailable in preview; other formula tools still work */}
 },[]);
 const all=useMemo(()=>FORMULA_BOARD.flatMap(group=>group.items.map(item=>({...item,section:group.id}))),[]);
 const selected=useMemo(()=>{
  const needle=query.trim().toLocaleLowerCase();
  return all.filter(row=>(!onlyFavorites||favorites.includes(row.id))&&(row.section===category||needle.length>0)
    &&(!needle||[row.name,row.plain,row.latex,row.note??""].some(s=>s.toLocaleLowerCase().includes(needle))));
 },[all,category,query,onlyFavorites,favorites]);
 const favoriteItems=all.filter(x=>favorites.includes(x.id));
 function toggle(id:string){
  const next=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];
  setFavorites(next);
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));setStatus("");}
  catch{setStatus("Favorites are saved for this session only; local storage was unavailable.");}
 }
 async function copy(content:string){
  try{await navigator.clipboard.writeText(content);setStatus("Copied "+mode.toUpperCase()+" formula.");}
  catch{setStatus("Clipboard unavailable; select the text below to copy manually.");}
 }
 async function exportFavorites(){
  const output=favoriteItems.map(item=>"## "+item.name+"\n\n$"+item.latex+"$\n\n"+item.plain).join("\n\n")||"# No favorite formulas";
  try{const ok=await exportFile("daily-desk-favorite-formulas.md",output);setStatus(ok?"Saved favorite formulas.":"Save cancelled.");}
  catch(error){setStatus("Export failed: "+String(error));}
 }
 return <section className="panel">
  <h3>Formula board · AP 公式库</h3>
  <p className="subtle">Website formula set with searchable categories, favorites and local LaTeX/plain-text copy. No AI service needed.</p>
  <div className="pill-row" role="group" aria-label="Formula category">
   {FORMULA_BOARD.map(group=><button type="button" key={group.id} className={category===group.id?"pill active-pill":"pill"} onClick={()=>{setCategory(group.id);setQuery("");}}>{group.title}</button>)}
  </div>
  <div className="actions">
   <label className="field-label">Search all formulas<input className="field" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Work, derivative, pH, z score..."/></label>
   <label className="field-label">Copy format<select className="field" value={mode} onChange={e=>setMode(e.target.value as FormulaMode)}>
    <option value="latex">LaTeX</option><option value="plain">Plain text</option>
   </select></label>
   <label className="field-label"><input type="checkbox" checked={onlyFavorites} onChange={e=>setOnlyFavorites(e.target.checked)}/> Favorites only ({favoriteItems.length})</label>
   <button type="button" className="secondary-button" onClick={()=>{void exportFavorites();}}>Export favorite formulas</button>
  </div>
  <p className="subtle">{selected.length} matching formulas · {all.length} in website collection</p>
  <div className="tool-grid">
   {selected.map(item=><article className="tool-card" key={item.id}>
    <strong>{item.name}</strong>
    <div className="math-formula" dangerouslySetInnerHTML={{__html:katex.renderToString(item.latex,{throwOnError:false,trust:false})}}/>
    <p className="subtle" style={{overflowWrap:"anywhere"}}>{item.plain}</p>
    {item.note&&<p className="subtle">{item.note}</p>}
    <div className="actions">
     <button type="button" className="secondary-button" onClick={()=>{void copy(mode==="latex"?item.latex:item.plain);}}>Copy {mode==="latex"?"LaTeX":"plain"}</button>
     <button type="button" className="secondary-button" onClick={()=>toggle(item.id)} aria-label={favorites.includes(item.id)?"Remove favorite":"Add favorite"}>
      {favorites.includes(item.id)?"★ Saved":"☆ Favorite"}
     </button>
    </div>
    <textarea className="field" rows={2} readOnly value={mode==="latex"?item.latex:item.plain} aria-label={"Selectable formula: "+item.name}/>
   </article>)}
  </div>
  {status&&<p role="status" className="subtle">{status}</p>}
 </section>;
}