import {describe,it,expect} from "vitest";
import {quickCheckMetrics,reviewQueueMetrics} from "./sentinelDashboard";
describe("Sentinel Go dashboard projections",()=>{
 it("presents actual Quick Check metrics without manufacturing risk probabilities",()=>{
  const actual={attention_index:63,band:"Review",disk_percent:82,incident_count:4,missing_evidence:["network"],behavior_baseline:false,trust_profile:true};
  const metrics=quickCheckMetrics(actual);
  expect(metrics.find(m=>m.label==="Attention Index")?.value).toBe("63");
  expect(metrics.find(m=>m.label==="Disk Used")?.value).toBe("82%");
  expect(metrics.find(m=>m.label==="Missing Evidence")?.value).toBe("1");
  expect(metrics.find(m=>m.label==="Attention Index")?.detail).toContain("不是恶意软件概率");
 });
 it("does not claim unsupported missing measurements",()=>{
  expect(quickCheckMetrics({attention_index:-1,disk_percent:120})).toEqual([]);
  expect(quickCheckMetrics(null)).toEqual([]);
 });
 it("reads original review queue counts with no verdicts",()=>{
  const metrics=reviewQueueMetrics({counts:{high:1,review:3,info:2},items:[]});
  expect(metrics.map(m=>m.value)).toEqual(["1","3","2"]);
  expect(reviewQueueMetrics({counts:null})).toEqual([]);
 });
});
