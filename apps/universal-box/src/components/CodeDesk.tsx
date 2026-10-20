import {useState, type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import type {DeskSnippet} from "../lib/workspace";

type Language="python"|"javascript"|"typescript"|"java"|"rust"|"json"|"text";
const SAMPLES:Record<Language,string>={
 python:"def main():\n    print('Hello, Daily Desk')\n\nif __name__ == '__main__':\n    main()\n",
 javascript:"function main() {\n  console.log('Hello, Daily Desk');\n}\n\nmain();\n",
 typescript:"function greet(name: string): string {\n  return `Hello, ${name}`;\n}\nconsole.log(greet('Daily Desk'));\n",
 java:"public class Main {\n  public static void main(String[] args) {\n    System.out.println(\"Hello, Daily Desk\");\n  }\n}\n",
 rust:"fn main() {\n    println!(\"Hello, Daily Desk\");\n}\n",
 json:"{\n  \"message\": \"Hello, Daily Desk\"\n}\n",
 text:"Notes about my code...\n",
};
export default function CodeDesk({snippets,onChange}:{snippets:DeskSnippet[];onChange:(next:DeskSnippet[])=>void}){
 const [language,setLanguage]=useState<Language>("python");
 const [source,setSource]=useState(SAMPLES.python);
 const [title,setTitle]=useState("Untitled snippet");
 const [status,setStatus]=useState("");
 const [find,setFind]=useState("");
 const [replace,setReplace]=useState("");
 const lines=source.split("\n").length;
 const matches=find?source.split(find).length-1:0;
 async function importFile(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value="";
  if(!file)return;
  if(file.size>1_000_000){setStatus("Limit: 1 MB per import.");return;}
  const sourceText=await file.text();
  if(source.trim()&&!window.confirm("Replace the code currently in the editor?"))return;
  setSource(sourceText);
  setTitle(file.name);
  setStatus("Loaded locally. Nothing was executed.");
 }
 function saveSnippet(){
  if(!source.trim()||snippets.length>=150)return;
  onChange([{id:crypto.randomUUID(),title:title.slice(0,120),code:source.slice(0,10000)},...snippets]);
  setStatus("Saved to local Code Board library.");
 }
 function switchLanguage(value:Language){
   setLanguage(value);
   if(!source.trim()||window.confirm("Replace code with a "+value+" starter template?"))setSource(SAMPLES[value]);
 }
 function replaceAll(){
  if(!find)return;
  setSource(current=>current.split(find).join(replace));
  setStatus("Replaced "+matches+" matching item(s).");
 }
 function formatJson(){
  try{setSource(JSON.stringify(JSON.parse(source) as unknown,null,2));setStatus("Formatted JSON locally.");}
  catch(e){setStatus("Invalid JSON: "+String(e));}
 }
 return <section className="panel">
  <p className="eyebrow">LOCAL CODE WORKBENCH</p>
  <h2>Code editor and snippets</h2>
  <p className="subtle">Write and organize code, search, replace, format JSON, import/export text files. This is an editor, not an online compiler; code is never executed or uploaded.</p>
  <div className="actions">
   <label className="field-label">Language <select className="field" value={language} onChange={e=>switchLanguage(e.target.value as Language)}>{Object.keys(SAMPLES).map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="field-label">Snippet title <input className="field" value={title} maxLength={120} onChange={e=>setTitle(e.target.value)}/></label>
   <label className="secondary-button" htmlFor="code-import">Import code file</label>
   <input className="sr-only" type="file" id="code-import" accept=".py,.js,.ts,.json,.java,.rs,.txt,.md" onChange={e=>{void importFile(e);}}/>
   <button type="button" className="secondary-button" onClick={()=>{void exportFile("daily-desk-code.txt",source).then(saved=>setStatus(saved?"Source exported.":"Export cancelled.")).catch(e=>setStatus(String(e)));}}>Export text</button>
   <button className="primary-button" type="button" onClick={saveSnippet} disabled={!source.trim()||snippets.length>=150}>Save to library</button>
  </div>
  <label className="field-label" htmlFor="code-editor-source">Source · {lines} lines · {source.length} characters</label>
  <textarea id="code-editor-source" className="field text-editor" spellCheck={false} rows={21} style={{width:"100%",fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace",tabSize:2}} value={source} onChange={e=>setSource(e.target.value)} />
  <div className="actions">
    <label className="field-label">Find<input className="field" value={find} onChange={e=>setFind(e.target.value)}/></label>
    <label className="field-label">Replace<input className="field" value={replace} onChange={e=>setReplace(e.target.value)}/></label>
    <span className="subtle">{matches} matches</span>
    <button className="secondary-button" type="button" disabled={!matches} onClick={replaceAll}>Replace all</button>
    <button className="secondary-button" type="button" onClick={formatJson}>Format JSON</button>
  </div>
  <h3>Saved snippets · {snippets.length}</h3>
  <div className="task-list">{snippets.slice(0,30).map(s=><div key={s.id} className="task-row">
   <div className="task-copy"><strong>{s.title}</strong><span className="subtle">{s.code.length} chars</span></div>
   <button className="secondary-button" type="button" onClick={()=>{setTitle(s.title);setSource(s.code);setStatus("Loaded saved snippet.");}}>Load</button>
   <button className="icon-button" aria-label={"Delete "+s.title} type="button" onClick={()=>{if(window.confirm("Delete this snippet?"))onChange(snippets.filter(item=>item.id!==s.id));}}>×</button>
  </div>)}</div>
  {status&&<p className="subtle" role="status">{status}</p>}
 </section>;
}
