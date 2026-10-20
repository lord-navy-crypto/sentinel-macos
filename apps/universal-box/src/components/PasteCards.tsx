import { useState } from "react";
import { parseQuickCards } from "../lib/pasteCards";

export default function PasteCards(){
  const [source,setSource] = useState("");
  const [position,setPosition] = useState(0);
  const [revealed,setRevealed] = useState(false);
  const cards=parseQuickCards(source);
  const index=Math.min(position, Math.max(cards.length-1,0));
  const current=cards[index];
  function navigate(delta:number){setPosition(p=>Math.min(Math.max(0,p+delta), Math.max(0,cards.length-1)));setRevealed(false);}
  return <div>
    <h3>Instant paste flashcards</h3>
    <p className="subtle">Like the web's ephemeral flip cards: paste lines as <code>prompt :: answer</code> or tab-separated pairs. These temporary cards are not saved to your notebook; use the Flashcards workspace for persistent decks.</p>
    <label htmlFor="paste-cards" className="field-label">Paste question-answer pairs</label>
    <textarea id="paste-cards" className="field text-editor" rows={8} value={source} onChange={event=>{setSource(event.target.value);setPosition(0);setRevealed(false);}} placeholder={"Capacitance :: Q / V\nNewton’s law :: F = ma"}/>
    <div className="metrics"><span>{cards.length} parsed card(s)</span></div>
    {current && <button className="flashcard" type="button" aria-label="Flip temporary card" onClick={()=>setRevealed(v=>!v)}>
      <span className="card-face-label">{revealed?"ANSWER":"QUESTION"}</span><strong>{revealed?current.back:current.front}</strong>
    </button>}
    <div className="actions spaced">
      <button type="button" className="secondary-button" onClick={()=>navigate(-1)} disabled={!current||index===0}>Previous</button>
      <span className="subtle">{current?`${index+1}/${cards.length}`:"Paste at least one card to begin"}</span>
      <button type="button" className="secondary-button" onClick={()=>navigate(1)} disabled={!current||index===cards.length-1}>Next</button>
    </div>
  </div>;
}
