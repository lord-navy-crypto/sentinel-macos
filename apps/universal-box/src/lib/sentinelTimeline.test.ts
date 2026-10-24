import {describe,it,expect} from "vitest";
import {projectSentinelTimeline,filterSentinelTimeline} from "./sentinelTimeline";
describe("Sentinel original Go timeline",()=>{
 it("reads timeline events and orders by native UNIX seconds",()=>{
  const data={events:[{id:"a",at:100,kind:"process",severity:"info",title:"Started"},{id:"b",at:200,kind:"file",severity:"review",title:"Changed"}],session_only:true};
  const t=projectSentinelTimeline(data)!;
  expect(t.events.map(e=>e.id)).toEqual(["b","a"]);
  expect(t.sessionOnly).toBe(true);
  expect(filterSentinelTimeline(t.events,"changed","file")).toHaveLength(1);
 });
 it("caps large lists and does not invent a timeline",()=>{
  const result=projectSentinelTimeline({events:Array.from({length:500},(_,at)=>({at}))})!;
  expect(result.events).toHaveLength(200);
  expect(result.total).toBe(500);
  expect(projectSentinelTimeline({events:null})).toBeNull();
 });
});
