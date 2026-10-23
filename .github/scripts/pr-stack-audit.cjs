"use strict";
/** Read-only audit of open GitHub PR base/head branch dependency chains.
 * This script never merges, edits, reviews or comments on a PR.
 * Node >=20 (only standard-library dependencies).
 */
const fs=require("node:fs");

function field(ref){return typeof ref==="string"?ref:ref?.ref??"";}
function analyzePrStack(input,defaultBranch="main"){
 if(!Array.isArray(input))throw Error("Expected an array of GitHub pull requests.");
 if(!defaultBranch||typeof defaultBranch!=="string")throw Error("Invalid repository default branch.");
 const prs=input.map(raw=>{
  if(!Number.isSafeInteger(raw.number)||raw.number<1)throw Error("A PR has no valid number.");
  const head=field(raw.head),base=field(raw.base);
  if(!head||!base)throw Error("PR #"+raw.number+" is missing base/head refs.");
  return {number:raw.number,head,base,draft:!!raw.draft,title:String(raw.title??"").slice(0,160)};
 });
 const byNumber=new Map(),byHead=new Map();
 for(const pr of prs){
  if(byNumber.has(pr.number))throw Error("Duplicate PR number #"+pr.number);
  if(byHead.has(pr.head))throw Error("Ambiguous duplicate source branch: "+pr.head);
  byNumber.set(pr.number,pr);byHead.set(pr.head,pr);
 }
 const records=[],cycleKeys=new Set(),cycles=[];
 for(const pr of prs){
  const trail=[],seen=new Map();
  let current=pr,root=null,externalBase=null,cycle=null;
  while(current){
   if(seen.has(current.number)){
    cycle=trail.slice(seen.get(current.number)).map(x=>x.number);
    const key=[...cycle].sort((a,b)=>a-b).join(",");
    if(!cycleKeys.has(key)){cycleKeys.add(key);cycles.push(cycle);}
    break;
   }
   seen.set(current.number,trail.length);
   trail.push(current);
   if(current.base===defaultBranch){root=current;break;}
   const parent=byHead.get(current.base);
   if(!parent){externalBase=current.base;break;}
   current=parent;
  }
  const chain=trail.map(x=>x.number).reverse();
  records.push({
   number:pr.number,base:pr.base,head:pr.head,draft:pr.draft,title:pr.title,
   depth:root?chain.length:null,root:root?.number??null,chain,
   externalBase,cycle,
  });
 }
 const roots=records.filter(x=>x.depth===1).sort((a,b)=>a.number-b.number);
 const groups=roots.map(root=>{
  const members=records.filter(x=>x.root===root.number)
   .sort((a,b)=>(a.depth??0)-(b.depth??0)||a.number-b.number);
  return {root:root.number,memberCount:members.length,
   maxDepth:Math.max(...members.map(x=>x.depth??0)),
   members:members.map(x=>({number:x.number,depth:x.depth,draft:x.draft,base:x.base,head:x.head}))};
 });
 const external=records.filter(x=>x.externalBase!==null).map(x=>({
  number:x.number,externalBase:x.externalBase,chain:x.chain,
 }));
 return {
  defaultBranch,total:prs.length,draft:prs.filter(x=>x.draft).length,
  readyForReview:prs.filter(x=>!x.draft).length,roots:groups,
  maxDepth:Math.max(0,...records.map(x=>x.depth??0)),
  externalBases:external,cycles,records:records.sort((a,b)=>a.number-b.number),
 };
}
async function listOpenPrs(repository,token,fetcher=fetch){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository))
  throw Error("GITHUB_REPOSITORY must be in owner/repo format.");
 const all=[];
 for(let page=1;page<=20;page++){
  const url="https://api.github.com/repos/"+repository+"/pulls?state=open&per_page=100&page="+page;
  const response=await fetcher(url,{headers:{
   Accept:"application/vnd.github+json",
   "X-GitHub-Api-Version":"2022-11-28",
   ...(token?{Authorization:"Bearer "+token}:{}),
  }});
  if(!response.ok)throw Error("GitHub PR listing failed: HTTP "+response.status+" (page "+page+")");
  const list=await response.json();
  if(!Array.isArray(list))throw Error("Unexpected GitHub PR listing response.");
  all.push(...list);
  if(list.length<100)return all;
 }
 throw Error("More than 2,000 open PRs; pagination limit reached without a complete audit.");
}
function summary(audit){
 const lines=[
  "GitHub PR dependency audit (read-only)",
  "Default branch: "+audit.defaultBranch,
  "Open PRs: "+audit.total+"; Draft: "+audit.draft+"; Ready for review: "+audit.readyForReview,
  "Longest known chain: "+audit.maxDepth+" PRs",
 ];
 for(const group of audit.roots.sort((a,b)=>b.maxDepth-a.maxDepth||a.root-b.root)){
  lines.push("Root #"+group.root+" -> "+group.memberCount+
   " PR(s), maximum depth "+group.maxDepth);
  if(group.maxDepth>=3){
   const tip=group.members.filter(x=>x.depth===group.maxDepth).map(x=>"#"+x.number).join(", ");
   lines.push("  Deepest tip(s): "+tip);
  }
 }
 if(audit.externalBases.length){
  lines.push("Needs inspection: "+audit.externalBases.length+
   " PR(s) depend on a branch without an OPEN PR in this listing.");
  lines.push("  A parent may already be merged or closed; this is not proof of a broken branch.");
 }
 if(audit.cycles.length)lines.push("ERROR: "+audit.cycles.length+" dependency cycle(s) detected.");
 lines.push("Audit does not confirm review approval, CI status, conflicts, real DMG QA or merge safety.");
 return lines.join("\n")+"\n";
}
async function runCli(){
 const repo=process.env.GITHUB_REPOSITORY;
 if(!repo)throw Error("Set GITHUB_REPOSITORY to owner/repo.");
 const args=process.argv.slice(2);
 const outAt=args.indexOf("--out");
 if(outAt>=0&&(!args[outAt+1]||args[outAt+1].startsWith("-")))
  throw Error("--out requires a file path.");
 const inputs=await listOpenPrs(repo,process.env.GITHUB_TOKEN??"");
 const branch=process.env.GITHUB_DEFAULT_BRANCH||"main";
 const result=analyzePrStack(inputs,branch);
 process.stdout.write(summary(result));
 if(outAt>=0)fs.writeFileSync(args[outAt+1],JSON.stringify(result,null,2)+"\n");
 if(result.cycles.length)process.exitCode=2;
}
if(require.main===module){
 runCli().catch(e=>{process.stderr.write("PR dependency audit failed: "+String(e)+"\n");process.exitCode=1;});
}
module.exports={analyzePrStack,listOpenPrs,summary};
