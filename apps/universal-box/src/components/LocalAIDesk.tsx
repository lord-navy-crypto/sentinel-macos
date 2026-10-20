import {type FormEvent,useEffect,useRef,useState} from "react";
import type {ChatCompletionMessageParam,MLCEngineInterface} from "@mlc-ai/web-llm";
import {openUrl} from "@tauri-apps/plugin-opener";
import {isTauri} from "@tauri-apps/api/core";
import {DEFAULT_WEBLLM_MODEL_ID,LOCAL_WEBLLM_MODELS,capChatHistory,validWebLLMModelId} from "../lib/localAiModels";
import {AI_LAUNCH_PREF,HF_MODELS,HF_SPACES,resolveAiLaunch,safeReadAiUrl,validateAiWebsiteUrl} from "../lib/aiLaunch";

type Chat={role:"user"|"assistant";content:string};
type EngineStatus="idle"|"checking"|"loading"|"ready"|"generating"|"error";
type CacheMap=Record<string,boolean>;
const MODEL_KEY="universal-box-webllm-model-v1";
const errorMessage=(e:unknown)=>e instanceof Error?e.message:String(e);
function initialModel(){
 try{const id=localStorage.getItem(MODEL_KEY);return id&&validWebLLMModelId(id)?id:DEFAULT_WEBLLM_MODEL_ID;}
 catch{return DEFAULT_WEBLLM_MODEL_ID;}
}
async function webGpuAvailable():Promise<boolean>{
 const gpu=(navigator as Navigator&{gpu?:{requestAdapter:()=>Promise<unknown>}}).gpu;
 if(!gpu)return false;
 try{return Boolean(await gpu.requestAdapter());}catch{return false;}
}
/** Dedicated, optional on-device WebLLM interface, not an online "site/API/BYOK" selector. */
export default function LocalAIDesk(){
 const [modelId,setModelId]=useState(initialModel);
 const [supported,setSupported]=useState<boolean|null>(null);
 const [status,setStatus]=useState<EngineStatus>("checking");
 const [notice,setNotice]=useState("检查 WebGPU 支持…");
 const [error,setError]=useState("");
 const [progress,setProgress]=useState(0);
 const [loaded,setLoaded]=useState("");
 const [cached,setCached]=useState<CacheMap>({});
 const [checkingCache,setCheckingCache]=useState(false);
 const [chat,setChat]=useState<Chat[]>([]);
 const [input,setInput]=useState("");
 const [browserSite,setBrowserSite]=useState(()=>{
   try{return safeReadAiUrl(localStorage);}catch{return "";}
 });
 const [browserStatus,setBrowserStatus]=useState("");
 const engineRef=useRef<MLCEngineInterface|null>(null);
 const workerRef=useRef<Worker|null>(null);
 const aliveRef=useRef(true);
 const busyRef=useRef(false);
 const generationRef=useRef(0);
 useEffect(()=>{
   aliveRef.current=true;
   void webGpuAvailable().then(ok=>{
     if(!aliveRef.current)return;
     setSupported(ok);setStatus("idle");
     setNotice(ok?"WebGPU 可用。选择一个模型并明确点击加载。":"当前浏览器或系统 WebView 不支持可用的 WebGPU 适配器。请在兼容浏览器打开 AP Website 的 Easy Local AI。");
   });
   return ()=>{
     aliveRef.current=false;
     generationRef.current++;
     const engine=engineRef.current;engineRef.current=null;
     try{void engine?.interruptGenerate();void engine?.unload().catch(()=>{});}catch{/* unmount */}
     workerRef.current?.terminate();workerRef.current=null;
   };
 },[]);
 async function release(){
   generationRef.current++;
   const engine=engineRef.current;engineRef.current=null;
   workerRef.current?.terminate();workerRef.current=null;
   if(engine)await engine.unload().catch(()=>{});
   if(aliveRef.current){setLoaded("");setChat([]);setProgress(0);setStatus("idle");setNotice("模型已卸载；已下载的数据仍会保留在本机模型缓存。");}
 }
 async function start(){
   if(busyRef.current||status==="loading"||status==="generating"||!supported)return;
   if(!validWebLLMModelId(modelId)){setError("未知或未经验证的模型。");return;}
   busyRef.current=true;setError("");setStatus("loading");setNotice("正在初始化 WebLLM…");setProgress(0);
   try{
     const webllm=await import("@mlc-ai/web-llm");
     webllm.prebuiltAppConfig.useIndexedDBCache=true;
     // Avoid attempting unknown IDs; list the actual model library used by this pinned runtime.
     if(!webllm.prebuiltAppConfig.model_list.some(item=>item.model_id===modelId))
       throw Error("当前 WebLLM 版本没有这个模型。请选择其他已验证的模型。");
     if(engineRef.current)await release();
     let engine:MLCEngineInterface|null=null;
     const onProgress=(info:{progress:number;text:string})=>{
       if(aliveRef.current){
         setProgress(Math.min(1,Math.max(0,Number.isFinite(info.progress)?info.progress:0)));
         setNotice(info.text||"正在下载或加载模型…");
       }
     };
     const worker=new Worker(new URL("../workers/webllm.worker.ts",import.meta.url),{type:"module"});
     workerRef.current=worker;
     try{
       engine=await webllm.CreateWebWorkerMLCEngine(worker,modelId,{initProgressCallback:onProgress});
     }catch(workerError){
       worker.terminate();workerRef.current=null;
       if(!aliveRef.current)throw workerError;
       setNotice("WebWorker 不兼容，尝试主线程 WebGPU 引擎（界面可能短暂卡顿）…");
       engine=await webllm.CreateMLCEngine(modelId,{initProgressCallback:onProgress});
     }
     if(!aliveRef.current){await engine.unload().catch(()=>{});return;}
     engineRef.current=engine;setLoaded(modelId);setStatus("ready");setProgress(1);
     setNotice("模型已在此设备加载。推理在本地进行，聊天内容不会发送到我们的服务器。");
     setCached(old=>({...old,[modelId]:true}));
   }catch(e){
     if(aliveRef.current){setStatus("error");setError(errorMessage(e));setNotice("模型加载失败。可以尝试更小的模型，或用系统浏览器打开 AP Website。");}
   }finally{busyRef.current=false;}
 }
 async function refreshCache(){
   if(busyRef.current||checkingCache)return;
   setCheckingCache(true);setError("");
   try{
     const llm=await import("@mlc-ai/web-llm");llm.prebuiltAppConfig.useIndexedDBCache=true;
     const pairs=await Promise.all(LOCAL_WEBLLM_MODELS.map(async m=>[
       m.id,await llm.hasModelInCache(m.id,llm.prebuiltAppConfig).catch(()=>false),
     ] as const));
     if(aliveRef.current)setCached(Object.fromEntries(pairs));
   }catch(e){if(aliveRef.current)setError(errorMessage(e));}
   finally{if(aliveRef.current)setCheckingCache(false);}
 }
 async function removeModelCache(){
   if(busyRef.current||status==="generating"||status==="loading")return;
   if(!window.confirm("确定删除所选模型的本地缓存吗？下次使用需要重新下载。"))return;
   busyRef.current=true;setError("");
   try{
     if(loaded===modelId)await release();
     const llm=await import("@mlc-ai/web-llm");
     llm.prebuiltAppConfig.useIndexedDBCache=true;
     await llm.deleteModelAllInfoInCache(modelId,llm.prebuiltAppConfig);
     if(aliveRef.current){setCached(old=>({...old,[modelId]:false}));setNotice("此模型的缓存已清除。");}
   }catch(e){if(aliveRef.current)setError("清理失败："+errorMessage(e));}
   finally{busyRef.current=false;}
 }
 async function send(event:FormEvent){
   event.preventDefault();
   const prompt=input.trim();
   if(!prompt||prompt.length>6000||!engineRef.current||status!=="ready"||busyRef.current)return;
   busyRef.current=true;setStatus("generating");setError("");
   const session=++generationRef.current;
   const previous=chat.filter(m=>m.content.trim());
   const history=capChatHistory([...previous,{role:"user",content:prompt}]);
   setChat([...previous,{role:"user",content:prompt},{role:"assistant",content:""}]);
   setInput("");
   try{
     const messages:ChatCompletionMessageParam[]=[
       {role:"system",content:"You are a helpful private on-device assistant. Reply clearly and naturally in the user's language. Be honest about limitations and uncertainty. Use concise Markdown when useful."},
       ...history.map(m=>({role:m.role,content:m.content}) as ChatCompletionMessageParam),
     ];
     const stream=await engineRef.current.chat.completions.create({
       messages,stream:true,max_tokens:500,temperature:.65,
     });
     let result="";
     for await(const part of stream){
       if(session!==generationRef.current||!aliveRef.current)break;
       result+=part.choices[0]?.delta?.content??"";
       const value=result;
       setChat(old=>old.map((msg,i)=>i===old.length-1&&msg.role==="assistant"?{...msg,content:value}:msg));
     }
     if(aliveRef.current&&session===generationRef.current&&!result.trim())throw Error("模型没有返回可见内容。");
   }catch(e){if(aliveRef.current&&session===generationRef.current){setError(errorMessage(e));setChat(old=>old.filter((m,i)=>i!==old.length-1));}}
   finally{busyRef.current=false;if(aliveRef.current&&session===generationRef.current)setStatus("ready");}
 }
 function stopGeneration(){
   generationRef.current++;
   try{void engineRef.current?.interruptGenerate();}catch{/* already stopped */}
   busyRef.current=false;setStatus("ready");setNotice("已请求停止生成。");
 }
 async function openExternal(url:string){
   try{
     if(isTauri())await openUrl(url);
     else window.open(url,"_blank","noopener,noreferrer");
     setBrowserStatus("已请求通过默认浏览器打开外部网页。外部网站的隐私和网络策略另行适用。");
   }catch(e){setBrowserStatus("打开链接失败："+errorMessage(e));}
 }
 function saveSite(){
   try{
     const site=validateAiWebsiteUrl(browserSite);
     localStorage.setItem(AI_LAUNCH_PREF,site);
     setBrowserSite(site);
     setBrowserStatus("已将网页地址保存在本机。不会传递聊天或文件内容。");
   }catch(e){setBrowserStatus(errorMessage(e));}
 }
 return <section className="panel local-ai-desk">
   <p className="eyebrow">UNIVERSAL BOX · EASY LOCAL AI</p>
   <h2>Easy Local AI · 本地 AI 工作台</h2>
   <p className="subtle">从 AP Website 移植 WebLLM 模型、WebGPU 和模型缓存管理。这里只有一种 AI 工作方式：<strong>浏览器本地推理</strong>；没有网站 API、密钥或 Ollama。第一次使用模型需要从模型来源下载文件，下载后可在缓存可用时离线运行。</p>
   <div className="local-ai-state" aria-live="polite">
     <span className={supported?"local-ai-dot online":"local-ai-dot"} aria-hidden="true"/>
     <strong>{supported===null?"检测 WebGPU…":supported?"WebGPU 已检测到可用适配器":"当前视图未检测到 WebGPU"}</strong>
     <small>{isTauri()?"Tauri / 系统 WebView":"Web browser"}</small>
   </div>
   <p className="subtle">{notice}</p>
   <div className="local-ai-controls">
     <label className="field-label" htmlFor="local-model-list">选择本地模型
       <select id="local-model-list" className="field" value={modelId}
         disabled={status==="loading"||status==="generating"||Boolean(loaded)}
         onChange={event=>{
           const id=event.target.value;
           if(!validWebLLMModelId(id))return;
           setModelId(id);
           try{localStorage.setItem(MODEL_KEY,id);}catch{/* optional */}
         }}>
         {LOCAL_WEBLLM_MODELS.map(model=><option key={model.id} value={model.id}>{model.name} · {model.detail}</option>)}
       </select>
     </label>
     <div className="local-ai-control-actions">
       {loaded
         ?<button type="button" className="secondary-button" disabled={status==="generating"} onClick={()=>{void release();}}>卸载当前模型</button>
         :<button type="button" className="primary-button" disabled={!supported||status==="loading"} onClick={()=>{void start();}}>下载 / 加载模型</button>}
       <button type="button" className="secondary-button" disabled={status==="loading"||checkingCache} onClick={()=>{void refreshCache();}}>{checkingCache?"检查中…":"检查模型缓存"}</button>
       <button type="button" className="secondary-button" disabled={status==="loading"||status==="generating"} onClick={()=>{void removeModelCache();}}>删除所选模型缓存</button>
     </div>
   </div>
   {status==="loading"&&<div className="local-ai-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100}
     aria-valuenow={Math.round(progress*100)} aria-label="模型加载进度">
     <div style={{width:Math.round(progress*100)+"%"}}/>
   </div>}
   <p className="subtle">所选模型缓存：{cached[modelId]===true?"已检测到缓存":cached[modelId]===false?"未缓存":"尚未检查"}。内存需求为参考值，模型下载通常比安装包大得多。</p>
   {error&&<p role="alert" className="local-ai-error">{error}</p>}
   <div className="local-ai-chat">
     <div className="local-ai-chat-head">
       <h3>与本地模型交流</h3>
       <div className="actions">
         {status==="generating"&&<button type="button" className="secondary-button" onClick={stopGeneration}>停止生成</button>}
         <button type="button" className="secondary-button" disabled={chat.length===0||status==="generating"} onClick={()=>setChat([])}>清除当前对话</button>
       </div>
     </div>
     <div className="local-ai-messages" aria-live="polite">
       {chat.length===0?<p className="subtle">先加载模型，再用中文或英文聊天、测试问答或让它解释短文本。对话不自动保存。</p>:
         chat.map((msg,i)=><div key={i} className={"local-ai-message "+msg.role}>
           <small>{msg.role==="user"?"你":"Local AI"}</small><p>{msg.content||"生成中…"}</p>
         </div>)}
     </div>
     <form onSubmit={event=>{void send(event);}}>
       <label className="field-label" htmlFor="local-ai-prompt">问题 / Prompt</label>
       <textarea id="local-ai-prompt" className="field text-editor" rows={3} maxLength={6000}
         placeholder={loaded?"问本地模型任何普通问题…":"请先加载本地 WebLLM 模型"} disabled={!loaded||status!=="ready"}
         value={input} onChange={event=>setInput(event.target.value)}/>
       <button className="primary-button" type="submit" disabled={!loaded||status!=="ready"||!input.trim()}>发送给本地模型</button>
     </form>
   </div>
   <details className="local-ai-browser">
     <summary>系统浏览器备用入口 · AP Website Easy Local AI</summary>
     <p className="subtle">如果 macOS 的内置 WKWebView 不支持 WebGPU，可在 Chrome / Edge 等兼容浏览器打开已有的 AP Website Easy Local AI。该网页使用独立的浏览器缓存，不能与桌面 WebView 保证共享模型缓存。</p>
     <label className="field-label" htmlFor="ap-ai-site">你自己的 AP Website 地址（HTTPS）
       <input id="ap-ai-site" className="field" type="url" placeholder="https://your-ap-website.example" value={browserSite} onChange={e=>setBrowserSite(e.target.value)}/>
     </label>
     <div className="actions">
       <button type="button" className="secondary-button" onClick={saveSite}>保存网页地址</button>
       <button type="button" className="primary-button" onClick={()=>{
         try{void openExternal(resolveAiLaunch(browserSite));}
         catch(e){setBrowserStatus(errorMessage(e));}
       }}>在浏览器打开 Easy Local AI ↗</button>
     </div>
     <p className="subtle">Hugging Face 上还有模型信息和互动演示，但在线 Spaces 不等于本地推理，服务提供者可能会接收用户输入。</p>
     <div className="actions">
       <button type="button" className="secondary-button" onClick={()=>{void openExternal(HF_MODELS);}}>Hugging Face 模型库 ↗</button>
       <button type="button" className="secondary-button" onClick={()=>{void openExternal(HF_SPACES);}}>Hugging Face Spaces ↗</button>
     </div>
     {browserStatus&&<p role="status" className="subtle">{browserStatus}</p>}
   </details>
 </section>;
}
