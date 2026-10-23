/** Scientific residual analysis for a previously validated least-squares fit.
 * Computed fields are finite double-precision values, not arbitrary-precision measurements.
 */
import type {ScatterChartData,ScatterPoint} from "./chartViz";
import type {LinearFit} from "./scatterRegression";
import {tableToCsv} from "./tableTools";

export type ResidualRecord={
 x:number;y:number;observedX:string;observedY:string;
 predicted:number;residual:number;
};
export type ResidualSummary={
 records:ResidualRecord[];sse:number;rmse:number;meanResidual:number;
 maxAbsoluteResidual:number;
};
export function analyzeFitResiduals(points:ReadonlyArray<ScatterPoint>,fit:LinearFit):ResidualSummary{
 if(points.length!==fit.observations||points.length<2||points.length>250)
  throw Error("Fit does not match the current scientific observations.");
 if(![fit.slope,fit.intercept,fit.xMean,fit.yMean].every(Number.isFinite))
  throw Error("Invalid linear fit parameters.");
 let sum=0,sse=0,maxAbsoluteResidual=0;
 const records=points.map(p=>{
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y))
   throw Error("Residual analysis requires finite numeric observations.");
  const predicted=fit.yMean+fit.slope*(p.x-fit.xMean);
  const residual=p.y-predicted;
  if(!Number.isFinite(predicted)||!Number.isFinite(residual))
   throw Error("Residual calculation exceeded floating-point range.");
  sum+=residual;sse+=residual*residual;
  maxAbsoluteResidual=Math.max(maxAbsoluteResidual,Math.abs(residual));
  return {x:p.x,y:p.y,observedX:p.xText,observedY:p.yText,predicted,residual};
 });
 const rmse=Math.sqrt(sse/records.length);
 if(![sum,sse,rmse,maxAbsoluteResidual].every(Number.isFinite))
  throw Error("Residual diagnostics exceed the supported numerical range.");
 return {records,sse,rmse,meanResidual:sum/records.length,maxAbsoluteResidual};
}
/** Safely serialize only verified numeric cells, preserving original measured strings. */
export function residualAnalysisCsv(data:ScatterChartData,summary:ResidualSummary):string{
 if(data.kind!=="scatter"||summary.records.length!==data.points.length)
  throw Error("Residual report does not match the current scatter plot.");
 const csvHeader=tableToCsv({headers:[
  data.xLabel,data.yLabel,"Predicted Y","Residual (observed - predicted)"
 ],rows:[]});
 const validNumeric=/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;
 const rows=summary.records.map((r,i)=>{
  if(!validNumeric.test(r.observedX)||!validNumeric.test(r.observedY)||
   r.x!==Number(r.observedX)||r.y!==Number(r.observedY)||
   r.x!==data.points[i].x||r.y!==data.points[i].y||
   !Number.isFinite(r.predicted)||!Number.isFinite(r.residual))
   throw Error("Unverified residual value cannot be exported.");
  return [r.observedX,r.observedY,String(r.predicted),String(r.residual)].join(",");
 });
 return csvHeader+"\r\n"+rows.join("\r\n")+"\r\n";
}
export function residualScatterChart(data:ScatterChartData,summary:ResidualSummary):ScatterChartData{
 if(data.kind!=="scatter"||summary.records.length!==data.points.length)
  throw Error("Residuals do not match the current dataset.");
 const points:ScatterPoint[]=summary.records.map(r=>({
  x:r.x,y:r.residual,xText:r.observedX,yText:String(r.residual),
 }));
 const vals=points.map(p=>p.y);
 return {...data,points,minimum:Math.min(0,...vals),maximum:Math.max(0,...vals),
  title:(data.title||"XY scatter")+" · residuals",
  yLabel:"Residual (observed − predicted)",
 };
}
