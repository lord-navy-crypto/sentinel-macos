/** Bounded, deterministic CSV -> SVG chart model. Plain text SVG only, no scripts. */
import {csvRows} from "../components/EverydayTools";
import {makeDataTable,type DataTable} from "./tableTools";
export type ChartKind="bar"|"line";
export type ChartAggregate="sum"|"average"|"count";
export type ChartPoint={label:string;value:number;items:number};
export type ChartData={points:ChartPoint[];minimum:number;maximum:number;title:string;unit:string;kind:ChartKind;aggregate:ChartAggregate};
export function parseChartCsv(source:string):DataTable{
 if(source.length>120_000)throw Error("CSV must be at most 120,000 characters.");
 const table=makeDataTable(csvRows(source),true);
 if(table.rows.length<1||table.rows.length>700||table.headers.length>25)
   throw Error("Chart CSV supports 1–700 data rows and up to 25 columns.");
 return table;
}
export function chartModel(
 table:DataTable,categoryColumn:number,valueColumn:number,aggregate:ChartAggregate,
 kind:ChartKind,title:string,unit:string,
):ChartData{
 if(!["bar","line"].includes(kind)||!["sum","average","count"].includes(aggregate))
   throw Error("Choose a supported chart type and aggregation.");
 if(!Number.isSafeInteger(categoryColumn)||categoryColumn<0||categoryColumn>=table.headers.length
   ||!Number.isSafeInteger(valueColumn)||valueColumn<0||valueColumn>=table.headers.length)
   throw Error("Choose valid category and numeric columns.");
 if(title.length>80||unit.length>18)throw Error("Chart title/unit is too long.");
 const groups=new Map<string,{sum:number;items:number}>();
 for(let i=0;i<table.rows.length;i++){
   const row=table.rows[i];
   const label=(row[categoryColumn]??"").trim()||"(blank)";
   if(label.length>70)throw Error("A chart category label exceeds 70 characters.");
   const raw=(row[valueColumn]??"").trim();
   if(aggregate!=="count"&&raw==="")continue;
   const number=aggregate==="count"?1:Number(raw);
   if(!Number.isFinite(number))throw Error("Non-numeric value at source row "+(i+2)+".");
   const record=groups.get(label)??{sum:0,items:0};
   record.sum+=number;record.items++;
   if(!Number.isFinite(record.sum))throw Error("Chart sum is out of range.");
   groups.set(label,record);
 }
 if(groups.size<1)throw Error("No plottable values found.");
 if(groups.size>24)throw Error("Chart supports up to 24 distinct categories. Filter data first.");
 const points=[...groups.entries()].map(([label,v])=>({
   label,value:aggregate==="average"?v.sum/v.items:v.sum,items:v.items,
 }));
 const values=points.map(p=>p.value);
 return {points,minimum:Math.min(0,...values),maximum:Math.max(0,...values),title,unit,kind,aggregate};
}
function escapeXml(text:string):string{
 return text.replace(/&/gu,"&amp;").replace(/</gu,"&lt;").replace(/>/gu,"&gt;")
   .replace(/"/gu,"&quot;").replace(/'/gu,"&apos;")
   .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu,"");
}
const numberText=(n:number)=>Number.isInteger(n)?String(n):n.toFixed(2).replace(/0+$/u,"").replace(/\.$/u,"");
export function chartSvg(chart:ChartData):string{
 if(chart.points.length<1||chart.points.length>24)throw Error("Invalid plotted data.");
 const width=960,height=540,left=88,right=36,top=90,bottom=142;
 const w=width-left-right,h=height-top-bottom;
 const low=chart.minimum,high=chart.maximum;
 const domainMin=low===high?low-1:low,domainMax=low===high?high+1:high;
 const span=domainMax-domainMin;
 const y=(v:number)=>top+h-(v-domainMin)/span*h;
 const baseline=y(0);
 const colors={ink:"#16324d",muted:"#60728b",accent:"#2563eb",grid:"#dbe5f3",paper:"#ffffff"};
 let shapes="";
 for(let t=0;t<=4;t++){
   const value=domainMin+(domainMax-domainMin)*t/4,pos=y(value);
   shapes+='<line x1="'+left+'" y1="'+pos.toFixed(2)+'" x2="'+(left+w)+'" y2="'+pos.toFixed(2)+'" stroke="'+colors.grid+'"/>';
   shapes+='<text x="'+(left-12)+'" y="'+(pos+5).toFixed(2)+'" font-size="15" text-anchor="end" fill="'+colors.muted+'">'+escapeXml(numberText(value))+'</text>';
 }
 const gap=w/chart.points.length;
 let points="";
 chart.points.forEach((p,index)=>{
   const x=left+(index+.5)*gap,cy=y(p.value);
   const safeLabel=escapeXml(p.label.length>16?p.label.slice(0,15)+"…":p.label);
   const safeFull=escapeXml(p.label+" · "+numberText(p.value)+" "+chart.unit);
   if(chart.kind==="bar"){
     const barWidth=Math.min(54,gap*.68),a=Math.min(cy,baseline),b=Math.max(cy,baseline);
     shapes+='<rect x="'+(x-barWidth/2).toFixed(2)+'" y="'+a.toFixed(2)+'" width="'+barWidth.toFixed(2)+'" height="'+Math.max(1,b-a).toFixed(2)+'" rx="5" fill="'+colors.accent+'"><title>'+safeFull+'</title></rect>';
   }else{
     points+=(index?" ":"")+x.toFixed(2)+","+cy.toFixed(2);
     shapes+='<circle cx="'+x.toFixed(2)+'" cy="'+cy.toFixed(2)+'" r="6" fill="'+colors.accent+'" stroke="white" stroke-width="2"><title>'+safeFull+'</title></circle>';
   }
   shapes+='<text x="'+x.toFixed(2)+'" y="'+(top+h+22)+'" font-size="13" fill="'+colors.muted+'" text-anchor="end" transform="rotate(-35 '+x.toFixed(2)+' '+(top+h+22)+')">'+safeLabel+'</text>';
 });
 if(chart.kind==="line"){
   // Place connecting stroke before data points so the dots remain visible.
   shapes='<polyline fill="none" stroke="'+colors.accent+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="'+points+'"/>'+shapes;
 }
 const title=escapeXml(chart.title||"Offline data chart");
 const unit=escapeXml(chart.unit?"("+chart.unit+")":"");
 return '<?xml version="1.0" encoding="UTF-8"?>\n'
  +'<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+title+'" viewBox="0 0 '+width+' '+height+'">'
  +'<rect width="960" height="540" rx="20" fill="'+colors.paper+'"/>'
  +'<text x="'+left+'" y="50" font-size="26" font-family="sans-serif" font-weight="700" fill="'+colors.ink+'">'+title+'</text>'
  +'<text x="'+left+'" y="74" font-size="13" font-family="sans-serif" fill="'+colors.muted+'">'+unit+' · '+chart.aggregate+' · '+chart.kind+'</text>'
  +'<g font-family="sans-serif">'+shapes+'</g>'
  +'</svg>';
}
