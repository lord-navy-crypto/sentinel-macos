import { useEffect, useRef, useState } from "react";

type NoiseKind = "off" | "white" | "pink" | "brown" | "soft";
const options: {id:NoiseKind; label:string}[] = [
  {id:"off",label:"Off"},
  {id:"white",label:"White noise"},
  {id:"pink",label:"Pink noise"},
  {id:"brown",label:"Brown noise"},
  {id:"soft",label:"Soft noise"}
];

function noiseBuffer(context:AudioContext, kind:Exclude<NoiseKind,"off">):AudioBuffer {
  const rate=context.sampleRate;
  const count=Math.min(10*rate, 960000);
  const buffer=context.createBuffer(1,count,rate);
  const data=buffer.getChannelData(0);
  let brown=0,p0=0,p1=0,p2=0,p3=0,p4=0,p5=0,p6=0;
  for(let i=0;i<count;i++){
    const white=Math.random()*2-1;
    if(kind==="white"){data[i]=white*.35;continue;}
    if(kind==="brown"){
      brown=Math.max(-1,Math.min(1,(brown+white*.023)/1.02));
      data[i]=brown*.55;continue;
    }
    p0=.99886*p0+white*.0555179;
    p1=.99332*p1+white*.0750759;
    p2=.969*p2+white*.153852;
    p3=.8665*p3+white*.3104856;
    p4=.55*p4+white*.5329522;
    p5=-.7616*p5-white*.016898;
    data[i]=(p0+p1+p2+p3+p4+p5+p6+white*.5362)*.07*(kind==="soft"?.45:1);
    p6=white*.115926;
  }
  return buffer;
}

export default function FocusNoise(){
  const [mode,setMode]=useState<NoiseKind>("off");
  const [volume,setVolume]=useState(.2);
  const [status,setStatus]=useState("");
  const engine=useRef<{context:AudioContext;source:AudioBufferSourceNode;gain:GainNode}|null>(null);

  function stop(){
    const active=engine.current;
    engine.current=null;
    if(active){
      try{active.source.stop();}catch{/* already stopped */}
      void active.context.close().catch(()=>{});
    }
  }

  useEffect(()=>()=>{const active=engine.current;if(active){try{active.source.stop();}catch{}void active.context.close().catch(()=>{});engine.current=null;}},[]);

  async function select(kind:NoiseKind){
    stop();
    setMode(kind);
    setStatus("");
    if(kind==="off")return;
    try{
      const context=new AudioContext();
      await context.resume();
      const gain=context.createGain();
      gain.gain.value=volume;
      const source=context.createBufferSource();
      source.buffer=noiseBuffer(context,kind);
      source.loop=true;
      source.connect(gain).connect(context.destination);
      source.start();
      engine.current={context,source,gain};
      setStatus("Locally generated sound playing. Stop with Off.");
    }catch(error){
      stop();
      setMode("off");
      setStatus("Audio playback is unavailable: "+String(error));
    }
  }
  function updateVolume(next:number){
    setVolume(next);
    const active=engine.current;
    if(active)active.gain.gain.setTargetAtTime(next,active.context.currentTime,.03);
  }

  return <div className="noise-panel">
    <h3>Focus sound bed</h3>
    <p className="subtle">Generated locally using Web Audio. No streaming, microphone or external recordings. Start at low volume.</p>
    <div className="pill-row" role="group" aria-label="Background sound">
      {options.map(option=><button type="button" key={option.id} className={mode===option.id?"pill active-pill":"pill"} onClick={()=>{void select(option.id);}}>{option.label}</button>)}
    </div>
    <label className="field-label" htmlFor="noise-volume">Sound volume · {Math.round(volume*100)}%</label>
    <input id="noise-volume" type="range" min={0} max={.35} step={.01} value={volume} onChange={e=>updateVolume(Number(e.target.value))}/>
    {status && <p className="subtle" role="status">{status}</p>}
  </div>;
}
