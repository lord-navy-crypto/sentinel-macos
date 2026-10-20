/**
 * Local ClassWiz-style computational modes. Standalone from the Next.js site.
 * All values are finite and dimensions/sizes are bounded for desktop safety.
 */
export type Complex = {re:number; im:number};
export type Matrix = number[][];
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
function finite(value:number):number {
  if(!Number.isFinite(value)) throw new Error("Values must be finite.");
  return value;
}
function numeric(source:string):number {
  const s=source.trim();
  if(!NUMBER.test(s))throw new Error("Enter a valid finite number.");
  return finite(Number(s));
}
export function parseComplex(source:string):Complex {
  const s=source.replace(/\s+/g,"").replace(/−/g,"-").replace(/j/gi,"i").toLowerCase();
  if(!s || s.length>120)throw new Error("Enter a complex number (max 120 characters).");
  if(!s.includes("i"))return {re:numeric(s),im:0};
  if(!s.endsWith("i") || s.indexOf("i")!==s.length-1)throw new Error("Use a+bi, a-bi, bi or a.");
  const body=s.slice(0,-1);
  let split=-1;
  for(let i=1;i<body.length;i++){
    if((body[i]==="+"||body[i]==="-") && body[i-1]!=="e")split=i;
  }
  const imag=(part:string)=>part===""||part==="+"?1:part==="-"?-1:numeric(part);
  const result=split===-1
    ? {re:0,im:imag(body)}
    : {re:numeric(body.slice(0,split)),im:imag(body.slice(split))};
  return {re:finite(result.re),im:finite(result.im)};
}
export function complexOperation(a:Complex,b:Complex,operation:"add"|"subtract"|"multiply"|"divide"|"conjugate"|"magnitude"|"argument"):
  Complex|number {
  let result:Complex|number;
  switch(operation){
    case "add": result={re:a.re+b.re,im:a.im+b.im};break;
    case "subtract":result={re:a.re-b.re,im:a.im-b.im};break;
    case "multiply":result={re:a.re*b.re-a.im*b.im,im:a.re*b.im+a.im*b.re};break;
    case "divide":{
      const scale=Math.max(Math.abs(b.re),Math.abs(b.im));
      if(scale===0)throw new Error("Cannot divide by zero.");
      const x=b.re/scale,y=b.im/scale,denom=x*x+y*y;
      result={re:(a.re*x+a.im*y)/denom/scale,im:(a.im*x-a.re*y)/denom/scale};break;
    }
    case "conjugate":result={re:a.re,im:-a.im};break;
    case "magnitude":result=Math.hypot(a.re,a.im);break;
    case "argument":result=Math.atan2(a.im,a.re)*180/Math.PI;break;
  }
  if(typeof result==="number")return finite(result);
  return {re:finite(result.re),im:finite(result.im)};
}
export function formatComplex(value:Complex):string {
  const clean=(x:number)=>String(Number(x.toPrecision(10)));
  const re=Math.abs(value.re)<1e-12?0:value.re;
  const im=Math.abs(value.im)<1e-12?0:value.im;
  if(im===0)return clean(re);
  const imaginary=Math.abs(im)===1?"i":clean(Math.abs(im))+"i";
  if(re===0)return (im<0?"-":"")+imaginary;
  return clean(re)+(im<0?" − ":" + ")+imaginary;
}
export function parseMatrix(source:string,size:2|3):Matrix {
  if(source.length>1000)throw new Error("Matrix input is too long.");
  const rows=source.trim().split(/[;\n]+/).map(row=>row.trim()).filter(Boolean);
  if(rows.length!==size)throw new Error(`Enter exactly ${size} matrix rows.`);
  return rows.map(row=>{
    const cells=row.split(/[,\s]+/).filter(Boolean);
    if(cells.length!==size)throw new Error(`Each row must contain ${size} numbers.`);
    return cells.map(numeric);
  });
}
function checkSquare(a:Matrix):number {
  const n=a.length;
  if((n!==2&&n!==3)||a.some(row=>row.length!==n||row.some(x=>!Number.isFinite(x))))
    throw new Error("Only finite 2×2 and 3×3 matrices are supported.");
  return n;
}
export type MatrixOperation = "add"|"subtract"|"multiply"|"transpose"|"determinant"|"inverse";
export function matrixOperation(a:Matrix,b:Matrix,operation:MatrixOperation):Matrix|number {
  const n=checkSquare(a);
  if(["add","subtract","multiply"].includes(operation)&&checkSquare(b)!==n)throw new Error("Matrix sizes differ.");
  if(operation==="transpose")return a.map((_,i)=>a.map(row=>row[i]));
  if(operation==="add"||operation==="subtract")return a.map((row,i)=>row.map((x,j)=>finite(x+(operation==="add"?1:-1)*b[i][j])));
  if(operation==="multiply")return a.map(row=>row.map((_,j)=>finite(row.reduce((s,x,k)=>s+x*b[k][j],0))));
  const m=a.map(row=>row.slice());
  const scale=Math.max(...m.flat().map(Math.abs));
  if(operation==="determinant"&&scale===0)return 0;
  const eps=scale*1e-12;
  if(operation==="determinant"){
    let det=1;
    for(let k=0;k<n;k++){
      let p=k;
      for(let i=k+1;i<n;i++)if(Math.abs(m[i][k])>Math.abs(m[p][k]))p=i;
      if(Math.abs(m[p][k])<=eps)return 0;
      if(p!==k){[m[p],m[k]]=[m[k],m[p]];det=-det;}
      const pivot=m[k][k];det*=pivot;
      for(let i=k+1;i<n;i++){const f=m[i][k]/pivot;for(let j=k+1;j<n;j++)m[i][j]-=f*m[k][j];}
    }
    return finite(det);
  }
  // Gauss-Jordan elimination with partial pivoting.
  const inv=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0));
  for(let k=0;k<n;k++){
    let p=k;
    for(let i=k+1;i<n;i++)if(Math.abs(m[i][k])>Math.abs(m[p][k]))p=i;
    if(scale===0||Math.abs(m[p][k])<=eps)throw new Error("Matrix is singular or ill-conditioned.");
    if(p!==k){[m[p],m[k]]=[m[k],m[p]];[inv[p],inv[k]]=[inv[k],inv[p]];}
    const pivot=m[k][k];
    for(let j=0;j<n;j++){m[k][j]/=pivot;inv[k][j]/=pivot;}
    for(let i=0;i<n;i++){
      if(i===k)continue;
      const f=m[i][k];
      for(let j=0;j<n;j++){m[i][j]-=f*m[k][j];inv[i][j]-=f*inv[k][j];}
    }
  }
  return inv.map(row=>row.map(finite));
}
export function formatMatrix(m:Matrix):string {
  return m.map(row=>row.map(x=>String(Number(x.toPrecision(10)))).join("\t")).join("\n");
}
export function parseNumberList(raw:string):number[]{
  if(raw.length>16000)throw new Error("List is too long.");
  const cells=raw.trim().split(/[,;\s]+/).filter(Boolean);
  if(!cells.length||cells.length>1000)throw new Error("Enter 1–1000 numbers.");
  return cells.map(numeric);
}
export function linearRegression(xs:number[],ys:number[]){
  if(xs.length!==ys.length||xs.length<2||xs.length>1000)throw new Error("Enter 2–1000 paired observations.");
  if([...xs,...ys].some(x=>!Number.isFinite(x)))throw new Error("Observations must be finite.");
  const n=xs.length;
  const meanX=xs.reduce((s,x)=>s+x,0)/n,meanY=ys.reduce((s,y)=>s+y,0)/n;
  let sxx=0,syy=0,sxy=0;
  for(let i=0;i<n;i++){const dx=xs[i]-meanX,dy=ys[i]-meanY;sxx+=dx*dx;syy+=dy*dy;sxy+=dx*dy;}
  if(!Number.isFinite(sxx)||!Number.isFinite(syy)||!Number.isFinite(sxy)||sxx===0)throw new Error("X must vary, and input magnitudes must be reasonable.");
  const slope=finite(sxy/sxx),intercept=finite(meanY-slope*meanX);
  return {n,meanX,meanY,sampleSdX:Math.sqrt(sxx/(n-1)),sampleSdY:Math.sqrt(syy/(n-1)),
    covariance:finite(sxy/(n-1)),r:syy===0?null:finite(Math.max(-1,Math.min(1,sxy/Math.sqrt(sxx*syy)))),
    slope,intercept,rSquared:syy===0?null:Math.max(0,Math.min(1,(sxy*sxy)/(sxx*syy)))};
}
function normalArgs(mu:number,sigma:number,x:number){
  if(![mu,sigma,x].every(Number.isFinite)||sigma<=0)throw new Error("Use finite values and standard deviation > 0.");
}
export function normalPdf(x:number,mu=0,sigma=1):number {
  normalArgs(mu,sigma,x);
  const z=(x-mu)/sigma;
  return Math.exp(-0.5*z*z)/(sigma*Math.sqrt(2*Math.PI));
}
/** Standard normal CDF approximation; typical absolute error below 8e-8. */
export function normalCdf(x:number,mu=0,sigma=1):number {
  normalArgs(mu,sigma,x);
  const z=(x-mu)/sigma,t=1/(1+0.2316419*Math.abs(z));
  const p=0.3989422804014327*Math.exp(-z*z/2)*t*
    (0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return Math.max(0,Math.min(1,z>=0?1-p:p));
}
function checkBinomial(n:number,k:number,p:number){
  if(!Number.isInteger(n)||n<0||n>200||!Number.isInteger(k)||!Number.isFinite(p)||p<0||p>1)
    throw new Error("Use n = 0–200, integer k, and probability 0–1.");
}
export function binomialPmf(n:number,k:number,p:number):number {
  checkBinomial(n,k,p);
  if(k<0||k>n)return 0;
  if(p===0)return k===0?1:0;
  if(p===1)return k===n?1:0;
  let logChoose=0;
  const kSmall=Math.min(k,n-k);
  for(let i=1;i<=kSmall;i++)logChoose+=Math.log(n-kSmall+i)-Math.log(i);
  return Math.exp(logChoose+k*Math.log(p)+(n-k)*Math.log1p(-p));
}
export function binomialCdf(n:number,k:number,p:number):number {
  checkBinomial(n,k,p);
  if(k<0)return 0;
  if(k>=n)return 1;
  let total=0;
  for(let j=0;j<=k;j++)total+=binomialPmf(n,j,p);
  return Math.max(0,Math.min(1,total));
}
