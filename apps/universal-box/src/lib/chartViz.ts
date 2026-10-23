/** Bounded, deterministic CSV -> SVG chart model. Plain text SVG only, no scripts. */
import {csvRows} from "../components/EverydayTools";
import {makeDataTable,tableToCsv,type DataTable} from "./tableTools";
import type {LinearFit} from "./scatterRegression";
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
 if(uncertaintyColumn!==null&&(!Number.isInteger(uncertaintyColumn)||
  uncertaintyColumn<0||uncertaintyColumn>=table.headers.length||
  uncertaintyColumn===xColumn||uncertaintyColumn===yColumn))
  throw Error("Select a separate numeric Y uncertainty column.");
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


/** Scientific numeric XY scatter; unlike category charts it NEVER aggregates/reorders rows. */
export type ScatterPoint={x:number;y:number;xText:string;yText:string;yError?:number;yErrorText?:string};
export type ScatterChartData={
 kind:"scatter";title:string;unit:string;xLabel:string;yLabel:string;
 points:ScatterPoint[];minimum:number;maximum:number;uncertaintyLabel?:string;
};
const decimal=/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;
export function scatterChartModel(
 table:DataTable,xColumn:number,yColumn:number,title:string,unit:string,
 uncertaintyColumn:number|null=null,
):ScatterChartData{
 if(!Number.isInteger(xColumn)||!Number.isInteger(yColumn)||xColumn===yColumn||
  xColumn<0||yColumn<0||xColumn>=table.headers.length||yColumn>=table.headers.length)
   throw Error("Select two different numeric X and Y columns.");
 if(title.length>80||unit.length>18)throw Error("Chart title/unit is too long.");
 if(table.rows.length>250)throw Error("XY scatter supports at most 250 data rows.");
 const points:ScatterPoint[]=[];
 for(let index=0;index<table.rows.length;index++){
  const row=table.rows[index];
  const xText=(row[xColumn]??"").trim(),yText=(row[yColumn]??"").trim();
  const uncertaintyText=uncertaintyColumn===null?"":(row[uncertaintyColumn]??"").trim();
  // A blank pair represents an explicitly missing observation, never zero.
  if(!xText&&!yText){
   if(uncertaintyText)throw Error("Scatter row "+(index+2)+" has uncertainty without XY measurements.");
   continue;
  }
  if(!decimal.test(xText)||!decimal.test(yText))
   throw Error("Scatter row "+(index+2)+" requires finite decimal X and Y numbers.");
  const x=Number(xText),y=Number(yText);
  if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>1e12||Math.abs(y)>1e12)
   throw Error("Scatter row "+(index+2)+" exceeds supported numeric range ±1e12.");
  if(uncertaintyColumn!==null){
   if(!decimal.test(uncertaintyText))
    throw Error("Scatter row "+(index+2)+" requires a nonnegative numeric Y uncertainty.");
   const yError=Number(uncertaintyText);
   if(!Number.isFinite(yError)||yError<0||yError>1e12)
    throw Error("Scatter row "+(index+2)+" requires Y uncertainty from 0 to 1e12.");
   points.push({x,y,xText,yText,yError,yErrorText:uncertaintyText});
  }else points.push({x,y,xText,yText});
 }
 if(!points.length)throw Error("No numeric XY pairs found.");
 const values=points.map(p=>p.y);
 return {
  kind:"scatter",points,title,unit,
  uncertaintyLabel:uncertaintyColumn===null?undefined:table.headers[uncertaintyColumn],
  xLabel:table.headers[xColumn],yLabel:table.headers[yColumn],
  minimum:Math.min(...values),maximum:Math.max(...values),
 };
}
/** Safe CSV: headers use untrusted-text protection; verified decimal cells stay verbatim. */
export function scatterChartCsv(data:ScatterChartData):string{
 if(data.kind!=="scatter"||data.points.length<1||data.points.length>250)
  throw Error("Invalid scatter export.");
 const headers=tableToCsv({headers:[data.xLabel,data.yLabel,...(data.uncertaintyLabel===undefined?[]:[data.uncertaintyLabel])],rows:[]});
 const rows=data.points.map(p=>{
  if(!decimal.test(p.xText)||!decimal.test(p.yText)||
   !Number.isFinite(p.x)||!Number.isFinite(p.y)||
   p.x!==Number(p.xText)||p.y!==Number(p.yText))
    throw Error("Unverified numerical point cannot be exported.");
  // Numeric cells cannot contain spreadsheet formula tokens, commas or newlines.
  if(data.uncertaintyLabel!==undefined){
   if(p.yErrorText===undefined||!decimal.test(p.yErrorText)||
      p.yError!==Number(p.yErrorText)||!Number.isFinite(p.yError)||p.yError<0)
    throw Error("Unverified uncertainty cannot be exported.");
   return p.xText+","+p.yText+","+p.yErrorText;
  }
  return p.xText+","+p.yText;
 });
 return headers+"\r\n"+rows.join("\r\n")+"\r\n";
}
function safeScatterDomain(values:number[]):[number,number]{
 let low=Math.min(...values),high=Math.max(...values);
 if(low===high){
  const gap=Math.max(1,Math.abs(low)*.08);
  low-=gap;high+=gap;
 }
 const padding=(high-low)*.08;
 return [low-padding,high+padding];
}
const numberLabel=(value:number)=>Number(value.toPrecision(5)).toString();
export function scatterChartSvg(chart:ScatterChartData,fit:LinearFit|null=null,zeroBaseline=false):string{
 if(chart.kind!=="scatter"||chart.points.length<1||chart.points.length>250)
  throw Error("Invalid XY scatter data.");
 const W=960,H=540,left=100,right=44,top=98,bottom=94;
 const pw=W-left-right,ph=H-top-bottom;
 const [xMin,xMax]=safeScatterDomain(chart.points.map(p=>p.x));
 const [yMin,yMax]=safeScatterDomain(chart.points.flatMap(p=>
  p.yError===undefined?[p.y]:[p.y-p.yError,p.y+p.yError]));
 if(![xMin,xMax,yMin,yMax].every(Number.isFinite)||xMax<=xMin||yMax<=yMin)
  throw Error("Scatter axis scaling is not finite.");
 const xp=(x:number)=>left+((x-xMin)/(xMax-xMin))*pw;
 const yp=(y:number)=>top+ph-((y-yMin)/(yMax-yMin))*ph;
 const ink="#16324d",muted="#60728b",grid="#dae4ef",point="#2563eb";
 let marks="";
 for(let i=0;i<=5;i++){
  const x=xMin+(xMax-xMin)*i/5,px=xp(x);
  const y=yMin+(yMax-yMin)*i/5,py=yp(y);
  marks+='<line x1="'+px.toFixed(2)+'" y1="'+top+'" x2="'+px.toFixed(2)+'" y2="'+(top+ph)+'" stroke="'+grid+'"/>';
  marks+='<text x="'+px.toFixed(2)+'" y="'+(top+ph+23)+'" text-anchor="middle" font-size="13" fill="'+muted+'">'+escapeXml(numberLabel(x))+'</text>';
  marks+='<line x1="'+left+'" y1="'+py.toFixed(2)+'" x2="'+(left+pw)+'" y2="'+py.toFixed(2)+'" stroke="'+grid+'"/>';
  marks+='<text x="'+(left-12)+'" y="'+(py+4).toFixed(2)+'" text-anchor="end" font-size="13" fill="'+muted+'">'+escapeXml(numberLabel(y))+'</text>';
 }
 const zeroLine=zeroBaseline&&yMin<=0&&yMax>=0?
  '<line data-series="residual-zero" x1="'+left+'" y1="'+yp(0).toFixed(2)+'" x2="'+(left+pw)+'" y2="'+yp(0).toFixed(2)+'" stroke="#c2410c" stroke-width="2" stroke-dasharray="6 5"/>':"";
 const fitLine=fit?
  '<g clip-path="url(#scatter-plot-clip)"><line data-series="least-squares" x1="'+xp(fit.xMin).toFixed(2)+'" y1="'+yp(fit.yMean+fit.slope*(fit.xMin-fit.xMean)).toFixed(2)+'" x2="'+xp(fit.xMax).toFixed(2)+'" y2="'+yp(fit.yMean+fit.slope*(fit.xMax-fit.xMean)).toFixed(2)+'" stroke="#d97706" stroke-width="3.5" stroke-dasharray="9 5"/></g>':"";
 const errorBars=chart.uncertaintyLabel===undefined?"":chart.points.map(p=>{
  if(p.yError===undefined||!Number.isFinite(p.yError)||p.yError<0)
   throw Error("Invalid chart uncertainty.");
  const x=xp(p.x).toFixed(2),upper=yp(p.y+p.yError).toFixed(2),
   lower=yp(p.y-p.yError).toFixed(2),capLeft=(xp(p.x)-6).toFixed(2),
   capRight=(xp(p.x)+6).toFixed(2);
  return '<g data-series="y-uncertainty" stroke="#64748b" stroke-width="2" fill="none">'+
   '<line x1="'+x+'" y1="'+upper+'" x2="'+x+'" y2="'+lower+'"/>'+
   '<line x1="'+capLeft+'" y1="'+upper+'" x2="'+capRight+'" y2="'+upper+'"/>'+
   '<line x1="'+capLeft+'" y1="'+lower+'" x2="'+capRight+'" y2="'+lower+'"/></g>';
 }).join("");
 const dots=chart.points.map(p=>'<circle cx="'+xp(p.x).toFixed(2)+'" cy="'+yp(p.y).toFixed(2)+'" r="5" fill="'+point+'" fill-opacity=".83" stroke="#ffffff" stroke-width="1.2"><title>'+
   escapeXml(p.xText+", "+p.yText)+'</title></circle>').join("");
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+escapeXml(chart.title||"XY scatter plot")+'" viewBox="0 0 960 540">'+
  '<rect width="960" height="540" rx="20" fill="#ffffff"/>'+
  '<text x="100" y="48" font-family="sans-serif" font-weight="700" font-size="25" fill="'+ink+'">'+escapeXml(chart.title||"XY scatter plot")+'</text>'+
  '<text x="100" y="72" font-family="sans-serif" font-size="13" fill="'+muted+'">Scientific XY scatter · '+chart.points.length+' observations</text>'+
  '<defs><clipPath id="scatter-plot-clip"><rect x="'+left+'" y="'+top+'" width="'+pw+'" height="'+ph+'"/></clipPath></defs>'+
  '<g font-family="sans-serif">'+marks+zeroLine+fitLine+errorBars+
  '<text x="508" y="513" text-anchor="middle" font-size="16" fill="'+ink+'">'+escapeXml(chart.xLabel)+'</text>'+
  '<text x="23" y="274" transform="rotate(-90 23 274)" text-anchor="middle" font-size="16" fill="'+ink+'">'+escapeXml(chart.yLabel+(chart.unit?" ("+chart.unit+")":""))+'</text>'+
  dots+'</g></svg>\n';
}
