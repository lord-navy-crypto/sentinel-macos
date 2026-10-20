import {useMemo,useState} from "react";
import {UNIT_GROUPS,PHYSICAL_CONSTANTS,convertTemperature,convertUnits,type UnitGroup,type TemperatureUnit} from "../lib/unitCatalog";

export default function UnitsDesk({onInsert}:{onInsert?:(value:string)=>void}){
 const [group,setGroup]=useState<UnitGroup>("Length");
 const [from,setFrom]=useState("m"),[to,setTo]=useState("cm");
 const [amount,setAmount]=useState("1");
 const [tempFrom,setTempFrom]=useState<TemperatureUnit>("C");
 const [tempTo,setTempTo]=useState<TemperatureUnit>("F");
 const [temperature,setTemperature]=useState("25");
 const [search,setSearch]=useState("");
 const [status,setStatus]=useState("");
 const units=Object.keys(UNIT_GROUPS[group]);
 const converted=useMemo(()=>{
   try{return Number(convertUnits(group,Number(amount),from,to).toPrecision(10)).toString();}
   catch{return "—";}
 },[group,amount,from,to]);
 const tempResult=useMemo(()=>{
   try{return Number(convertTemperature(Number(temperature),tempFrom,tempTo).toPrecision(10)).toString();}
   catch{return "—";}
 },[temperature,tempFrom,tempTo]);
 const filtered=PHYSICAL_CONSTANTS.filter(c=>(c.name+" "+c.value).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 function switchGroup(next:UnitGroup){
   const labels=Object.keys(UNIT_GROUPS[next]);
   setGroup(next);setFrom(labels[0]);setTo(labels[1]);
 }
 async function copy(text:string){
   try{await navigator.clipboard.writeText(text);setStatus("Copied.");}
   catch{setStatus("Clipboard unavailable.");}
 }
 return <section className="panel">
   <h3>Unit converter & physical constants · 单位与常数</h3>
   <p className="subtle">All eight website unit groups, including charge and force, plus temperature and the complete constants reference. Works offline.</p>
   <div className="tools-pair">
     <label className="field-label">Quantity
       <select className="field" value={group} onChange={e=>switchGroup(e.target.value as UnitGroup)}>
         {Object.keys(UNIT_GROUPS).map(name=><option key={name} value={name}>{name}</option>)}
       </select>
     </label>
     <label className="field-label">Value
       <input className="field" type="number" value={amount} onChange={e=>setAmount(e.target.value)}/>
     </label>
     <label className="field-label">From
       <select className="field" value={from} onChange={e=>setFrom(e.target.value)}>
         {units.map(unit=><option key={unit} value={unit}>{unit}</option>)}
       </select>
     </label>
     <label className="field-label">To
       <select className="field" value={to} onChange={e=>setTo(e.target.value)}>
         {units.map(unit=><option key={unit} value={unit}>{unit}</option>)}
       </select>
     </label>
   </div>
   <div className="actions">
     <p className="stat-pill" role="status">{converted} {to}</p>
     <button className="secondary-button" type="button" disabled={converted==="—"} onClick={()=>{void copy(converted);}}>Copy result</button>
     {onInsert&&<button className="secondary-button" type="button" disabled={converted==="—"} onClick={()=>onInsert(converted)}>Use in calculator</button>}
   </div>
   <h4>Temperature · 温度</h4>
   <div className="tools-pair">
     <label className="field-label">Temperature
       <input className="field" type="number" value={temperature} onChange={e=>setTemperature(e.target.value)}/>
     </label>
     <label className="field-label">From
       <select className="field" value={tempFrom} onChange={e=>setTempFrom(e.target.value as TemperatureUnit)}>
         <option value="C">°C</option><option value="F">°F</option><option value="K">K</option>
       </select>
     </label>
     <label className="field-label">To
       <select className="field" value={tempTo} onChange={e=>setTempTo(e.target.value as TemperatureUnit)}>
         <option value="C">°C</option><option value="F">°F</option><option value="K">K</option>
       </select>
     </label>
   </div>
   <p className="stat-pill">{tempResult} {tempTo==="K"?"K":tempTo==="C"?"°C":"°F"}</p>
   {tempResult==="—"&&<p className="subtle">Check the input; below absolute zero is not a valid physical temperature.</p>}
   <h4>AP physical constants</h4>
   <label className="field-label">Search constants
     <input className="field" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Planck, electron, k, gravity…"/>
   </label>
   <div className="tool-grid">
     {filtered.map(c=><article className="tool-card" key={c.name}>
       <strong>{c.name}</strong>
       <p className="subtle">{c.value}</p>
       <div className="actions">
         <button type="button" className="secondary-button" onClick={()=>{void copy(c.insert);}}>Copy value</button>
         {onInsert&&<button type="button" className="secondary-button" onClick={()=>onInsert(c.insert)}>Use in calculator</button>}
       </div>
     </article>)}
   </div>
   {status&&<p className="subtle" role="status">{status}</p>}
 </section>;
}