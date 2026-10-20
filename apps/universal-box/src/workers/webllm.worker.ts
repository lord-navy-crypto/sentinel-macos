/** Browser-local GPU model worker. Never calls a remote inference API. */
import {WebWorkerMLCEngineHandler,prebuiltAppConfig} from "@mlc-ai/web-llm";
prebuiltAppConfig.useIndexedDBCache=true;
const handler=new WebWorkerMLCEngineHandler();
self.onmessage=(event:MessageEvent)=>{handler.onmessage(event);};
