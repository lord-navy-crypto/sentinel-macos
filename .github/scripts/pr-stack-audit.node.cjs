"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {analyzePrStack,listOpenPrs,summary}=require("./pr-stack-audit.cjs");
const pr=(number,head,base,draft=true)=>({
 number,head:{ref:head},base:{ref:base},draft,title:"PR "+number,
});

test("finds a real-shaped 38-PR stack rooted at main without pretending it is merged",()=>{
 const chain=Array.from({length:38},(_,i)=>pr(79+i,"feature-"+(79+i),
  i===0?"main":"feature-"+(78+i)));
 const result=analyzePrStack([...chain,pr(78,"independent","main")]);
 assert.equal(result.total,39);
 assert.equal(result.maxDepth,38);
 assert.equal(result.draft,39);
 assert.equal(result.roots.length,2);
 const deep=result.roots.find(x=>x.root===79);
 assert.equal(deep.memberCount,38);
 assert.deepEqual(deep.members.map(x=>x.number),Array.from({length:38},(_,i)=>79+i));
 const tip=result.records.find(x=>x.number===116);
 assert.equal(tip.depth,38);
 assert.equal(tip.root,79);
 assert.deepEqual(tip.chain,Array.from({length:38},(_,i)=>79+i));
 assert.match(summary(result),/Root #79 -> 38 PR/);
});
test("identifies closed-ancestor/external bases as review warnings, never auto-merges",()=>{
 const result=analyzePrStack([pr(1,"feature-a","main"),pr(3,"feature-c","feature-closed")]);
 assert.equal(result.roots.length,1);
 assert.equal(result.externalBases.length,1);
 assert.deepEqual(result.externalBases[0],{
  number:3,externalBase:"feature-closed",chain:[3],
 });
 assert.match(summary(result),/parent may already be merged or closed/i);
});
test("detects a circular branch dependency without looping forever",()=>{
 const result=analyzePrStack([
  pr(1,"branch-a","branch-b"),pr(2,"branch-b","branch-c"),pr(3,"branch-c","branch-a"),
 ]);
 assert.equal(result.maxDepth,0);
 assert.equal(result.roots.length,0);
 assert.equal(result.cycles.length,1);
 assert.deepEqual([...result.cycles[0]].sort((a,b)=>a-b),[1,2,3]);
});
test("invalid, ambiguous or partial graph data fails rather than inventing ancestry",()=>{
 for(const input of [
  [pr(1,"a","main"),pr(1,"b","main")],
  [pr(1,"same","main"),pr(2,"same","main")],
  [{number:4,head:{ref:"x"},draft:true}],
  [{number:"four",head:"x",base:"main"}],
 ])assert.throws(()=>analyzePrStack(input));
});
test("handles GitHub REST list pages with exactly 100 elements and no requested write permissions",async()=>{
 const page1=Array.from({length:100},(_,i)=>pr(i+1,"branch-"+(i+1),"main"));
 const page2=[pr(101,"branch-101","main")];
 const requests=[];
 const fetcher=async(url,options)=>{
  requests.push({url,options});
  return {ok:true,json:async()=>new URL(url).searchParams.get("page")==="1"?page1:page2};
 };
 const data=await listOpenPrs("example/repo","sample-token",fetcher);
 assert.equal(data.length,101);
 assert.equal(requests.length,2);
 assert.match(requests[0].url,/state=open&per_page=100&page=1/u);
 assert.equal(requests[0].options.headers.Authorization,"Bearer sample-token");
 assert.equal(requests[0].options.method,undefined);
 assert.equal(analyzePrStack(data).roots.length,101);
});
test("the API reader rejects bad repository names and incomplete HTTP responses",async()=>{
 await assert.rejects(()=>listOpenPrs("invalid"),/owner\/repo/);
 await assert.rejects(()=>listOpenPrs("example/repo","",async()=>({
  ok:false,status:403,
 })),/HTTP 403/);
 await assert.rejects(()=>listOpenPrs("example/repo","",async()=>({
  ok:true,json:async()=>({oops:true}),
 })),/Unexpected/);
});
