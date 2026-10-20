import {describe,it,expect} from "vitest";
import {parseChartCsv,chartModel,chartSvg} from "./chartViz";
describe("v0.26 offline chart model",()=>{
 const basic=parseChartCsv("Month,Sales,Orders\nJan,15,2\nFeb,23,3\nJan,5,1\nMar,-8,2");
 it("groups categories by sum, average or count and supports mixed-sign data",()=>{
   const sum=chartModel(basic,0,1,"sum","bar","Monthly sales","USD");
   expect(sum.points).toEqual([
     {label:"Jan",value:20,items:2},{label:"Feb",value:23,items:1},{label:"Mar",value:-8,items:1},
   ]);
   expect(sum.minimum).toBe(-8);expect(sum.maximum).toBe(23);
   expect(chartModel(basic,0,1,"average","line","","").points[0].value).toBe(10);
   expect(chartModel(basic,0,2,"count","bar","","").points[0].value).toBe(2);
 });
 it("treats blank numeric rows as missing and rejects malformed numeric fields",()=>{
   const blank=parseChartCsv("Category,Value\nA,\nB,7");
   expect(chartModel(blank,0,1,"sum","bar","","").points).toEqual([{label:"B",value:7,items:1}]);
   expect(chartModel(blank,0,1,"count","bar","","").points).toHaveLength(2);
   expect(()=>chartModel(parseChartCsv("Group,Value\nA,NaN"),0,1,"sum","line","","")).toThrow(/Non-numeric/);
   expect(()=>chartModel(basic,0,25,"sum","bar","","")).toThrow(/valid/);
   expect(()=>chartModel(basic,0,1,"sum","invalid" as "bar","","")).toThrow(/supported/);
 });
 it("safely exports SVG vector graphics, escaping text that looks like markup",()=>{
   const source=parseChartCsv('Category,Value\n"<![CDATA[hello]]>",5\n"<script>alert(1)</script>",8');
   const chart=chartModel(source,0,1,"sum","line",'<script>alert("X")</script>',"A&B");
   const svg=chartSvg(chart);
   expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
   expect(svg).toContain("&lt;script&gt;");
   expect(svg).toContain("A&amp;B");
   expect(svg).toContain('<polyline');
   expect(svg).not.toContain('<script>');
   expect(svg).not.toContain("<![CDATA[hello]]>");
 });
 it("limits input sizes, category counts, and long labels",()=>{
   expect(()=>parseChartCsv("x".repeat(120001))).toThrow(/120,000/);
   const many="Category,Value\n"+Array.from({length:25},(_,i)=>"G"+i+","+i).join("\n");
   expect(()=>chartModel(parseChartCsv(many),0,1,"sum","bar","","")).toThrow(/24 distinct/);
   const long=parseChartCsv("Category,Value\n"+"A".repeat(71)+",1");
   expect(()=>chartModel(long,0,1,"sum","bar","","")).toThrow(/70 characters/);
 });
});
