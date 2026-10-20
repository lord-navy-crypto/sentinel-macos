/** Curated from AP ReasonLab's browser WebLLM model list. Avoid unverified IDs. */
export type LocalModelTier="micro"|"light"|"medium";
export type LocalModel={id:string;name:string;tier:LocalModelTier;vramMB:number;detail:string};
export const LOCAL_WEBLLM_MODELS:readonly LocalModel[]=[
 {id:"Qwen3-0.6B-q4f16_1-MLC",name:"Qwen3 Micro · 中英双语",tier:"micro",vramMB:1403,detail:"首次运行推荐 · 约 1.4 GB 显存"},
 {id:"Qwen2.5-0.5B-Instruct-q4f16_1-MLC",name:"Qwen2.5 Micro · 轻量",tier:"micro",vramMB:945,detail:"低内存设备测试 · 约 1 GB 显存"},
 {id:"Llama-3.2-1B-Instruct-q4f16_1-MLC",name:"Llama 3.2 1B · English",tier:"micro",vramMB:879,detail:"英文短对话 · 约 0.9 GB 显存"},
 {id:"Qwen3-1.7B-q4f16_1-MLC",name:"Qwen3 Light+ · 双语",tier:"light",vramMB:2037,detail:"较好的中文/英文表现 · 约 2 GB 显存"},
 {id:"Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",name:"Qwen2.5 Coder 1.5B",tier:"light",vramMB:1630,detail:"短代码解释与练习 · 约 1.6 GB 显存"},
 {id:"Llama-3.2-3B-Instruct-q4f16_1-MLC",name:"Llama 3.2 3B · English",tier:"medium",vramMB:2264,detail:"英文对话 · 约 2.3 GB 显存"},
];
export const DEFAULT_WEBLLM_MODEL_ID=LOCAL_WEBLLM_MODELS[0].id;
export function validWebLLMModelId(id:string):boolean{return LOCAL_WEBLLM_MODELS.some(m=>m.id===id);}
export function capChatHistory(texts:readonly {role:"user"|"assistant";content:string}[]):{role:"user"|"assistant";content:string}[]{
 return texts.slice(-12).map(item=>({role:item.role,content:item.content.slice(0,6500)}));
}
