import {forwardRef,useEffect,useImperativeHandle,useRef} from "react";
import {Terminal} from "@xterm/xterm";
import {FitAddon} from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

/** Interactive VT renderer backed exclusively by the local, user-started Rust PTY.
 * This component itself never spawns commands, calls the network or stores a transcript.
 */
export type TerminalScreenHandle={
 write:(data:string)=>void;
 clear:()=>void;
 reset:()=>void;
 focus:()=>void;
 fit:()=>void;
};
type Props={
 visible:boolean;
 onInput:(data:string)=>void;
 onResize:(cols:number,rows:number)=>void;
};

const TerminalScreen=forwardRef<TerminalScreenHandle,Props>(function TerminalScreen(
 {visible,onInput,onResize},ref){
 const mountRef=useRef<HTMLDivElement>(null);
 const terminalRef=useRef<Terminal|null>(null);
 const fitRef=useRef<FitAddon|null>(null);
 const onInputRef=useRef(onInput);
 const onResizeRef=useRef(onResize);
 const visibleRef=useRef(visible);
 const pendingRef=useRef<string[]>([]);
 onInputRef.current=onInput;
 onResizeRef.current=onResize;
 visibleRef.current=visible;

 useImperativeHandle(ref,()=>({
  write(data:string){
   if(terminalRef.current)terminalRef.current.write(data);
   else{
    pendingRef.current.push(data);
    if(pendingRef.current.length>100)pendingRef.current.shift();
   }
  },
  clear(){terminalRef.current?.clear();pendingRef.current=[];},
  reset(){terminalRef.current?.reset();pendingRef.current=[];},
  focus(){terminalRef.current?.focus();},
  fit(){if(visibleRef.current)fitRef.current?.fit();}
 }),[]);

 useEffect(()=>{
  const host=mountRef.current;
  if(!host)return;
  const term=new Terminal({
   cursorBlink:true,
   cursorStyle:"block",
   allowTransparency:false,
   scrollback:3500,
   fontFamily:"SFMono-Regular, Menlo, Monaco, Consolas, monospace",
   fontSize:13,
   lineHeight:1.35,
   tabStopWidth:4,
   screenReaderMode:true,
   theme:{
    background:"#101922",
    foreground:"#e1f1e5",
    cursor:"#c3e9ff",
    selectionBackground:"#34627b",
    black:"#101922",
    red:"#ef8383",
    green:"#9adb97",
    yellow:"#f5d08c",
    blue:"#81b9ec",
    magenta:"#d7a8eb",
    cyan:"#87d9dc",
    white:"#e1f1e5",
    brightBlack:"#8295a2",
    brightRed:"#fca0a0",
    brightGreen:"#b5eea6",
    brightYellow:"#ffe2ae",
    brightBlue:"#a9ccfa",
    brightMagenta:"#efc5fa",
    brightCyan:"#a4eff1",
    brightWhite:"#ffffff",
   }
  });
  const fit=new FitAddon();
  terminalRef.current=term;
  fitRef.current=fit;
  term.loadAddon(fit);
  term.open(host);
  const dataDisposable=term.onData(data=>onInputRef.current(data));
  const resizeDisposable=term.onResize(({cols,rows})=>{
   onResizeRef.current(cols,rows);
  });
  if(pendingRef.current.length){
   term.write(pendingRef.current.join(""));
   pendingRef.current=[];
  }
  const adjust=()=>{if(visibleRef.current&&host.isConnected)fit.fit();};
  const observer=new ResizeObserver(adjust);
  observer.observe(host);
  const frame=requestAnimationFrame(adjust);
  return ()=>{
   cancelAnimationFrame(frame);
   observer.disconnect();
   dataDisposable.dispose();
   resizeDisposable.dispose();
   term.dispose();
   terminalRef.current=null;
   fitRef.current=null;
  };
 },[]);

 useEffect(()=>{
  if(!visible)return;
  const frame=requestAnimationFrame(()=>fitRef.current?.fit());
  return ()=>cancelAnimationFrame(frame);
 },[visible]);

 return <div className="terminal-screen-shell" data-testid="terminal-screen"
  style={{display:visible?"block":"none"}}>
  <div className="terminal-screen-mount" ref={mountRef} role="region"
   aria-label="原生终端输出和键盘交互（xterm.js）" />
 </div>;
});
export default TerminalScreen;
