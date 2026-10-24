import {describe,it,expect} from "vitest";
import {projectSentinelGraph,layoutSentinelGraph} from "./sentinelGraph";
describe("Sentinel native evidence graph projection",()=>{
 it("respects Go's schema and filters broken links",()=>{
  const g=projectSentinelGraph({nodes:[{id:"p1",type:"process",label:"Terminal",risk:7},{id:"f1",type:"file",label:"report"}],
   edges:[{from:"p1",to:"f1",relation:"uses"},{from:"p1",to:"missing",relation:"unknown"}]})!;
  expect(g.nodes).toHaveLength(2);
  expect(g.edges).toHaveLength(1);
  expect(g.nodes[0].risk).toBe(7);
  expect(layoutSentinelGraph(g).points).toHaveLength(2);
 });
 it("bounds untrusted-sized graphs and refuses invalid input",()=>{
  const nodes=Array.from({length:110},(_,i)=>({id:"n"+i,type:"process"}));
  const g=projectSentinelGraph({nodes,edges:[]})!;
  expect(g.nodes.length).toBe(75);
  expect(g.truncated).toBe(true);
  expect(projectSentinelGraph({nodes:[],edges:"bad"})).toBeNull();
 });
 it("uses unique ids and retains native semantics",()=>{
  const g=projectSentinelGraph({nodes:[{id:"same",type:"network",signals:["one"]},{id:"same"}],edges:[]})!;
  expect(g.nodes).toHaveLength(1);
  expect(g.nodes[0].signals).toEqual(["one"]);
 });
});
