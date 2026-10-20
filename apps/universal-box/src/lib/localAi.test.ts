import {describe,it,expect} from "vitest";
import {LOCAL_WEBLLM_MODELS,DEFAULT_WEBLLM_MODEL_ID,validWebLLMModelId,capChatHistory} from "./localAiModels";
import {resolveAiLaunch,validateAiWebsiteUrl,safeReadAiUrl,HF_MODELS,HF_SPACES} from "./aiLaunch";

describe("v0.29 ported WebLLM catalogue",()=>{
 it("starts with the same light bilingual model as AP Website",()=>{
   expect(DEFAULT_WEBLLM_MODEL_ID).toBe("Qwen3-0.6B-q4f16_1-MLC");
   expect(LOCAL_WEBLLM_MODELS.some(m=>m.id===DEFAULT_WEBLLM_MODEL_ID)).toBe(true);
   expect(LOCAL_WEBLLM_MODELS.every(m=>m.vramMB>500&&m.vramMB<5000)).toBe(true);
 });
 it("does not accept arbitrary downloaded model identifiers",()=>{
   expect(validWebLLMModelId("Qwen3-1.7B-q4f16_1-MLC")).toBe(true);
   expect(validWebLLMModelId("not-a-real-model")).toBe(false);
   expect(new Set(LOCAL_WEBLLM_MODELS.map(m=>m.id)).size).toBe(LOCAL_WEBLLM_MODELS.length);
 });
 it("bounds chat history and prompt content prior to local inference",()=>{
   const messages=Array.from({length:22},(_,i)=>({
     role:i%2?"assistant":"user" as "user"|"assistant",content:"x".repeat(7000),
   }));
   const result=capChatHistory(messages);
   expect(result).toHaveLength(12);
   expect(result.every(m=>m.content.length===6500)).toBe(true);
 });
});
describe("v0.29 safe external browser fallback",()=>{
 it("accepts configured secure AP Website and opens actual easy-local-ai route",()=>{
   expect(resolveAiLaunch("https://study.example/")).toBe("https://study.example/easy-local-ai");
   expect(resolveAiLaunch("https://study.example/easy-local-ai")).toBe("https://study.example/easy-local-ai");
   expect(safeReadAiUrl({getItem:()=> "https://study.example"})).toBe("https://study.example/");
 });
 it("rejects unsafe URLs and direct data transfer via query fragments",()=>{
   for(const url of ["http://study.example","javascript:alert(1)","https://x.example/?prompt=private",
     "https://user:pass@study.example","https://study.example/#secret","https://localhost:8080","https://example.com:8443/"]){
     expect(()=>validateAiWebsiteUrl(url),url).toThrow();
   }
 });
 it("keeps the Hugging Face links explicit online services",()=>{
   expect(new URL(HF_MODELS).hostname).toBe("huggingface.co");
   expect(new URL(HF_SPACES).pathname).toBe("/spaces");
   expect(safeReadAiUrl({getItem:()=> "bad-url"})).toBe("");
 });
});
