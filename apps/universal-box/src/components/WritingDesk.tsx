import { type ChangeEvent, type KeyboardEvent, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { exportFile } from "../lib/output";
import { markdownToDocx } from "../lib/documentExport";
import "katex/dist/katex.min.css";

type Props = { markdown: string; onChange: (markdown: string) => void };
const templates: Record<string,string> = {
  blank: "",
  meeting: "# Meeting Notes\n\n**Date:** \n**Attendees:** \n\n## Agenda\n\n- \n\n## Decisions\n\n- \n\n## Action Items\n\n- [ ] ",
  study: "# Study Notes\n\n## Key Concepts\n\n- \n\n## Worked Example\n\nGiven: \n\nSolution: \n\n## Review Questions\n\n1. ",
  report: "# Report Title\n\n## Executive Summary\n\n## Background\n\n## Analysis\n\n## Conclusion\n\n## References\n",
};
function safeFilename(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^\.+/u,"").slice(0,70)||"document";
}
export default function WritingDesk({ markdown, onChange }: Props) {
  const [filename, setFilename] = useState("my-study-document");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [replacement, setReplacement] = useState("");
  const [preview, setPreview] = useState<"split"|"editor"|"preview">("split");
  const input = useRef<HTMLTextAreaElement>(null);
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);

  const words = markdown.trim() ? markdown.trim().split(/\s+/u).length : 0;
  const outline = useMemo(()=> markdown.split(/\r?\n/u).map((line,i)=>{
    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    return heading ? {level:heading[1].length,title:heading[2],line:i}:null;
  }).filter((heading):heading is {level:number;title:string;line:number} => heading!==null),[markdown]);
  const found = search ? markdown.toLocaleLowerCase().split(search.toLocaleLowerCase()).length-1 : 0;

  function apply(value: string) {
    if(value===markdown)return;
    past.current.push(markdown);
    if(past.current.length>60)past.current.shift();
    future.current=[];
    onChange(value.slice(0,50000));
  }
  function undo() {
    const previous=past.current.pop();
    if(previous===undefined)return;
    future.current.push(markdown);
    onChange(previous);
  }
  function redo() {
    const next=future.current.pop();
    if(next===undefined)return;
    past.current.push(markdown);
    onChange(next);
  }
  function decorate(before: string, after = "", placeholder = "text") {
    const target=input.current;
    if(!target)return;
    const start=target.selectionStart, end=target.selectionEnd;
    const selection=markdown.slice(start,end)||placeholder;
    const result=markdown.slice(0,start)+before+selection+after+markdown.slice(end);
    apply(result);
    requestAnimationFrame(()=>{target.focus();target.setSelectionRange(start+before.length,start+before.length+selection.length);});
  }
  function insertSnippet(snippet: string) {
    const target=input.current;
    const position=target?.selectionStart??markdown.length;
    apply(markdown.slice(0,position)+snippet+markdown.slice(position));
    requestAnimationFrame(()=>{target?.focus();target?.setSelectionRange(position+snippet.length,position+snippet.length);});
  }
  function jumpToLine(line:number) {
    const lines=markdown.split(/\r?\n/u);
    const pos=lines.slice(0,line).reduce((acc,item)=>acc+item.length+1,0);
    input.current?.focus();
    input.current?.setSelectionRange(pos,pos+lines[line].length);
  }
  function replaceOne() {
    if(!search)return;
    const pos=markdown.toLocaleLowerCase().indexOf(search.toLocaleLowerCase());
    if(pos<0){setStatus("No match found.");return;}
    apply(markdown.slice(0,pos)+replacement+markdown.slice(pos+search.length));
    setStatus("Replaced first match.");
  }
  function replaceAll() {
    if(!search)return;
    let pos=0,count=0,out="";
    const lowered=markdown.toLocaleLowerCase(),needle=search.toLocaleLowerCase();
    for (;;) {
      const next=lowered.indexOf(needle,pos);
      if(next<0)break;
      out+=markdown.slice(pos,next)+replacement;
      pos=next+search.length;
      count++;
    }
    if(!count){setStatus("No matches found.");return;}
    apply(out+markdown.slice(pos));
    setStatus(`Replaced ${count} match(es).`);
  }
  async function saveDocument(format: "md" | "txt" | "docx") {
    try {
      const data=format==="docx" ? await markdownToDocx(markdown) : markdown;
      const saved=await exportFile(safeFilename(filename)+"."+format,data);
      setStatus(saved ? "Document saved locally." : "Save cancelled.");
    } catch (error) {setStatus(error instanceof Error ? error.message : String(error));}
  }
  async function openMarkdown(event:ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0];
    event.target.value="";
    if(!file)return;
    if(file.size>1_000_000){setStatus("File exceeds 1 MB import limit.");return;}
    if(!/\.(md|txt|markdown)$/iu.test(file.name)){setStatus("Choose Markdown or plain text.");return;}
    if(markdown.trim()&&!window.confirm("Replace the current document with this file? Export first if needed."))return;
    apply(await file.text());
    setFilename(file.name.replace(/\.[^.]+$/u,""));
    setStatus("Document imported into your local workspace.");
  }
  function shortcuts(event:KeyboardEvent<HTMLTextAreaElement>) {
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="z"){
      event.preventDefault();
      if(event.shiftKey)redo();else undo();
    }
  }
  function useTemplate(name:string) {
    if(!Object.prototype.hasOwnProperty.call(templates,name))return;
    if(markdown.trim()&&!window.confirm("Replace your current document with this template?"))return;
    apply(templates[name]);
    setStatus("Template loaded.");
  }

  return <section className="panel writing-workbench">
    <p className="eyebrow">FULLER LOCAL DOCUMENT EDITOR</p>
    <h2>Writing workbench</h2>
    <p className="subtle">Markdown and LaTeX live preview, structured document outline, formatting tools, find/replace, templates, file import, Word export and system printing.</p>
    <div className="actions">
      <label className="field-label" htmlFor="writing-name">Document title</label>
      <input className="field" id="writing-name" value={filename} onChange={e=>setFilename(e.target.value)} maxLength={80}/>
      <label className="secondary-button" htmlFor="writing-import">Import .md / .txt</label>
      <input id="writing-import" className="sr-only" type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" onChange={e=>{void openMarkdown(e);}}/>
      <button className="secondary-button" type="button" onClick={()=>{void saveDocument("md");}}>Save Markdown</button>
      <button className="secondary-button" type="button" onClick={()=>{void saveDocument("docx");}}>Export Word .docx</button>
      <button className="secondary-button" type="button" onClick={()=>{void saveDocument("txt");}}>Save text</button>
      <button className="primary-button" type="button" onClick={()=>window.print()}>Print / Save PDF</button>
    </div>
    <div className="actions">
      <label className="field-label" htmlFor="writing-template">Document template</label>
      <select className="field" id="writing-template" defaultValue="" onChange={e=>{useTemplate(e.target.value);e.target.value="";}}>
        <option value="">Select a template</option>
        <option value="blank">Blank document</option>
        <option value="meeting">Meeting minutes</option>
        <option value="study">Study notes</option>
        <option value="report">Structured report</option>
      </select>
      <label className="field-label" htmlFor="writing-layout">Layout</label>
      <select className="field" id="writing-layout" value={preview} onChange={e=>setPreview(e.target.value as typeof preview)}>
        <option value="split">Split editor / preview</option>
        <option value="editor">Editor only</option>
        <option value="preview">Preview only</option>
      </select>
      <button className="secondary-button" type="button" onClick={undo} disabled={!past.current.length}>Undo</button>
      <button className="secondary-button" type="button" onClick={redo} disabled={!future.current.length}>Redo</button>
    </div>
    <div className="document-toolbar" role="group" aria-label="Markdown formatting tools">
      <button type="button" onClick={()=>decorate("**","**","bold text")}>Bold</button>
      <button type="button" onClick={()=>decorate("*","*","italic text")}>Italic</button>
      <button type="button" onClick={()=>decorate("# ","","Heading")}>H1</button>
      <button type="button" onClick={()=>decorate("## ","","Subheading")}>H2</button>
      <button type="button" onClick={()=>decorate("- ","","List item")}>List</button>
      <button type="button" onClick={()=>decorate("> ","","Quotation")}>Quote</button>
      <button type="button" onClick={()=>decorate("`","`","code")}>Inline code</button>
      <button type="button" onClick={()=>decorate("[","](https://example.com)","link text")}>Link</button>
      <button type="button" onClick={()=>insertSnippet("\n| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |\n")}>Table</button>
      <button type="button" onClick={()=>insertSnippet("\n$E = mc^2$\n")}>Math</button>
    </div>
    <div className="document-find">
      <label className="field-label">Find <input className="field" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search text"/></label>
      <label className="field-label">Replace <input className="field" value={replacement} onChange={e=>setReplacement(e.target.value)} placeholder="Replacement"/></label>
      <span className="subtle">{found} match(es)</span>
      <button className="secondary-button" type="button" disabled={!found} onClick={replaceOne}>Replace first</button>
      <button className="secondary-button" type="button" disabled={!found} onClick={replaceAll}>Replace all</button>
    </div>
    {outline.length>0&&<nav className="document-outline" aria-label="Document heading outline">
      <strong>Outline</strong>
      {outline.slice(0,40).map((heading,index)=><button type="button" key={index} style={{paddingLeft:10+heading.level*10}} onClick={()=>{setPreview(p=>p==="preview"?"split":p);requestAnimationFrame(()=>jumpToLine(heading.line));}}>{heading.title}</button>)}
    </nav>}
    <div className={preview==="split"?"writing-grid": "writing-grid single-view"}>
      {preview!=="preview"&&<div>
        <label htmlFor="writing-markdown" className="field-label">Editable Markdown source</label>
        <textarea ref={input} id="writing-markdown" value={markdown} onChange={e=>apply(e.target.value)}
          onKeyDown={shortcuts} className="field writing-textarea" spellCheck rows={20} maxLength={50000}
          placeholder={"# My notes\n\nWrite **Markdown** and $E = mc^2$ here…"} />
        <p className="subtle">{words} words · {markdown.length} characters · autosaved to the native workspace.</p>
      </div>}
      {preview!=="editor"&&<div>
        <span className="field-label">Live formatted preview</span>
        <article className="markdown-preview printable-document" aria-label="Document preview">
          <Markdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex]}>{markdown}</Markdown>
        </article>
      </div>}
    </div>
    <p className="subtle">Word export now retains headings, actual bullet lists and basic bold/italic/strike/inline-code styling. Complex tables, links, embedded images and LaTeX remain simplified. The system Print dialog and PDF layout still need Mac testing.</p>
    {status&&<p className="subtle" role="status">{status}</p>}
  </section>;
}
