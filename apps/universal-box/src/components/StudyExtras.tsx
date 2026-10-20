import { type FormEvent, useMemo, useState } from "react";
import type { WorkspaceData } from "../lib/workspace";
import PasteCards from "./PasteCards";

export type StudyMode = "paste" | "countdown" | "mistakes" | "code" | "dictation" | "rewrite" | "typewriter" | "reading";
const MODULES:{id:StudyMode;label:string}[] = [
  {id:"paste",label:"Instant flip cards"},
  {id:"countdown",label:"Exam countdown"},
  {id:"mistakes",label:"Mistake notebook"},
  {id:"code",label:"Code board"},
  {id:"dictation",label:"Dictation practice"},
  {id:"rewrite",label:"Paraphrase compare"},
  {id:"typewriter",label:"Typewriter review"},
  {id:"reading",label:"Reading & annotation"},
];
function localDate(v:Date):string {
  const x=new Date(v.getTime()-v.getTimezoneOffset()*60000);
  return x.toISOString().slice(0,10);
}
export default function StudyExtras({workspace,onChange,initialMode="countdown"}:{workspace:WorkspaceData;onChange:(value:WorkspaceData)=>void;initialMode?:StudyMode}){
  const [mode,setMode]=useState<StudyMode>(initialMode);
  const [title,setTitle]=useState("");
  const [detail,setDetail]=useState("");
  const [due,setDue]=useState("");
  const [source,setSource]=useState("");
  const [answer,setAnswer]=useState("");
  const [reveal,setReveal]=useState(0);
  const [status,setStatus]=useState("");
  const exams=workspace.exams??[],mistakes=workspace.mistakes??[],snippets=workspace.snippets??[];
  const today=localDate(new Date());
  const lines=source.split(/\r?\n/u).filter(Boolean);
  const overlap=useMemo(()=>{
    const words=(value:string)=>new Set(value.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]);
    const a=words(source),b=words(answer);
    return a.size?Math.round([...a].filter(word=>b.has(word)).length/a.size*100):0;
  },[source,answer]);
  function add(event:FormEvent){
    event.preventDefault();
    if(!title.trim())return;
    if(mode==="countdown"){
      if(!due||exams.length>=100)return;
      onChange({...workspace,exams:[{id:crypto.randomUUID(),name:title.trim().slice(0,160),date:due},...exams]});
    }else if(mode==="mistakes"){
      if(!detail.trim()||mistakes.length>=300)return;
      onChange({...workspace,mistakes:[{id:crypto.randomUUID(),topic:title.trim().slice(0,300),correction:detail.trim().slice(0,2000)},...mistakes]});
    }else if(mode==="code"){
      if(!detail.trim()||snippets.length>=150)return;
      onChange({...workspace,snippets:[{id:crypto.randomUUID(),title:title.trim().slice(0,120),code:detail.slice(0,10000)},...snippets]});
    }
    setTitle("");setDetail("");setDue("");setStatus("Saved to local workspace.");
  }
  function speak(){
    if(!("speechSynthesis" in window)){setStatus("Speech playback is unavailable on this system.");return;}
    window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(source.slice(0,3500));
    utterance.lang="en-US";
    utterance.rate=.9;
    window.speechSynthesis.speak(utterance);
    setStatus("Reading the practice passage with system text-to-speech.");
  }
  return <section className="panel">
    <p className="eyebrow">STUDY & ENGLISH WORKBENCH</p><h2>Learning tools</h2>
    <p className="subtle">Ported everyday helpers: countdowns, private mistake log, code snippets, dictation, rewrite checks, typewriter memory and reading notes.</p>
    <div className="pill-row" role="group" aria-label="Learning module">{MODULES.map(item=><button key={item.id} type="button" className={mode===item.id?"pill active-pill":"pill"} onClick={()=>{setMode(item.id);setStatus("");}}>{item.label}</button>)}</div>
    {(mode==="countdown"||mode==="mistakes"||mode==="code")&&<>
      <form onSubmit={add}>
        <label className="field-label" htmlFor="study-title">{mode==="countdown"?"Exam name":mode==="mistakes"?"Question or mistake":"Snippet name"}</label>
        <input id="study-title" className="field" style={{width:"100%"}} value={title} onChange={e=>setTitle(e.target.value)} maxLength={300}/>
        {mode==="countdown"?<><label htmlFor="study-date" className="field-label">Exam date</label><input className="field" type="date" id="study-date" value={due} onChange={e=>setDue(e.target.value)}/></>:<>
          <label className="field-label" htmlFor="study-detail">{mode==="code"?"Source code":"Correct answer, fix or takeaway"}</label>
          <textarea id="study-detail" className="field text-editor" rows={5} value={detail} onChange={e=>setDetail(e.target.value)} maxLength={mode==="code"?10000:2000}/>
        </>}
        <div className="actions"><button className="primary-button" type="submit" disabled={!title.trim()||(mode==="countdown"?!due:!detail.trim())}>Save locally</button></div>
      </form>
      <div className="task-list">
        {mode==="countdown"&&exams.map(item=>{
          const days=Math.ceil((Date.parse(item.date+"T00:00:00")-Date.parse(today+"T00:00:00"))/86400000);
          return <article key={item.id} className="task-row"><div className="task-copy"><strong>{item.name}</strong><span className="task-meta">{item.date} · {days>=0?days+" day(s) remaining":"Past by "+Math.abs(days)+" day(s)"}</span></div><button className="icon-button" aria-label={"Remove "+item.name} onClick={()=>onChange({...workspace,exams:exams.filter(e=>e.id!==item.id)})}>×</button></article>;
        })}
        {mode==="mistakes"&&mistakes.map(item=><article key={item.id} className="task-row"><div className="task-copy"><strong>{item.topic}</strong><span className="subtle" style={{whiteSpace:"pre-wrap"}}>{item.correction}</span></div><button className="icon-button" aria-label={"Remove "+item.topic} onClick={()=>onChange({...workspace,mistakes:mistakes.filter(e=>e.id!==item.id)})}>×</button></article>)}
        {mode==="code"&&snippets.map(item=><article key={item.id} className="task-row"><div className="task-copy"><strong>{item.title}</strong><pre style={{overflowX:"auto",maxWidth:"100%"}}>{item.code}</pre></div><button className="icon-button" aria-label={"Remove "+item.title} onClick={()=>onChange({...workspace,snippets:snippets.filter(e=>e.id!==item.id)})}>×</button></article>)}
      </div>
    </>}
    {(mode==="dictation"||mode==="rewrite"||mode==="typewriter"||mode==="reading")&&<>
      <label className="field-label" htmlFor="study-source">{mode==="dictation"?"Passage to hear":mode==="reading"?"Reading passage":mode==="rewrite"?"Original paragraph":"Study content (one line per step)"}</label>
      <textarea id="study-source" className="field text-editor" rows={7} value={mode==="reading"?workspace.readingNotes??"":source} onChange={e=>{if(mode==="reading")onChange({...workspace,readingNotes:e.target.value});else {setSource(e.target.value);setReveal(0);}}} placeholder="Paste your study material…"/>
      {mode==="dictation"&&<><div className="actions"><button type="button" className="primary-button" onClick={speak} disabled={!source.trim()}>Play dictation</button><button className="secondary-button" type="button" onClick={()=>window.speechSynthesis?.cancel()}>Stop</button></div>
        <label className="field-label" htmlFor="dictation-typed">What did you hear?</label><textarea className="field" rows={5} id="dictation-typed" value={answer} onChange={e=>setAnswer(e.target.value)}/>
        <p className="subtle">Word overlap (not an official transcription score): {overlap}%</p>
      </>}
      {mode==="rewrite"&&<><label htmlFor="rewrite-answer" className="field-label">Your rewrite</label><textarea className="field" rows={7} id="rewrite-answer" value={answer} onChange={e=>setAnswer(e.target.value)}/><div className="metrics"><span>{overlap}% vocabulary overlap</span><span>Review your meaning and structure manually; overlap alone is not a plagiarism check.</span></div></>}
      {mode==="typewriter"&&<><p className="subtle">Showing {Math.min(reveal,lines.length)} of {lines.length} lines.</p><pre className="study-reveal">{lines.slice(0,reveal).join("\n")||"Press Reveal next to start."}</pre><div className="actions"><button className="primary-button" type="button" onClick={()=>setReveal(r=>Math.min(lines.length,r+1))}>Reveal next line</button><button className="secondary-button" type="button" onClick={()=>setReveal(0)}>Reset</button></div></>}
      {mode==="reading"&&<p className="subtle">Reading passage and notes are autosaved with your local workspace. Rich in-text highlighting is a later step.</p>}
    </>}
    {mode==="paste"&&<PasteCards/>}
    {status&&<p className="subtle" role="status">{status}</p>}
  </section>;
}
