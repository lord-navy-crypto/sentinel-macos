import type {ScatterPoint} from "./chartViz";
export type LinearFit={
 slope:number;intercept:number;rSquared:number|null;observations:number;
 xMin:number;xMax:number;
};
/** Ordinary least-squares y = mx + b; no rounding, interpolation or data mutation. */
export function fitScatterLine(points:ReadonlyArray<ScatterPoint>):LinearFit|null{
 if(points.length<2||points.length>250)return null;
 for(const p of points){
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
 }
 // Centering first avoids cancellation from naive sum(x*x)-sum(x)^2 / n.
 const n=points.length;
 const x0=points[0].x,y0=points[0].y;
 let dxSum=0,dySum=0,xMin=Infinity,xMax=-Infinity;
 for(const p of points){
  dxSum+=p.x-x0;dySum+=p.y-y0;
  xMin=Math.min(xMin,p.x);xMax=Math.max(xMax,p.x);
 }
 if(!(xMax>xMin))return null;
 const xMean=x0+dxSum/n,yMean=y0+dySum/n;
 let sxx=0,sxy=0,syy=0;
 for(const p of points){
  const dx=(p.x-x0)-dxSum/n,dy=(p.y-y0)-dySum/n;
  sxx+=dx*dx;sxy+=dx*dy;syy+=dy*dy;
 }
 if(!(sxx>0)||!Number.isFinite(sxx)||!Number.isFinite(sxy)||!Number.isFinite(syy))return null;
 const slope=sxy/sxx,intercept=yMean-slope*xMean;
 if(!Number.isFinite(slope)||!Number.isFinite(intercept))return null;
 let error=0;
 for(const p of points){
  const prediction=yMean+slope*(p.x-xMean);
  const residual=p.y-prediction;
  error+=residual*residual;
 }
 if(!Number.isFinite(error))return null;
 // R² is undefined when Y is constant; do not invent a perfect correlation.
 const rSquared=syy===0?null:Math.max(0,Math.min(1,1-error/syy));
 return {slope,intercept,rSquared,observations:n,xMin,xMax};
}
export const formatRegressionNumber=(value:number):string=>Number(value.toPrecision(9)).toString();
