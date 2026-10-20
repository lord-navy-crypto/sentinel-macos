export type DiffPart={type:"same"|"add"|"del";text:string};
export function normalizeForComparison(text:string,ignoreWhitespace=false,ignoreCase=false):string{
 let out=ignoreCase?text.toLocaleLowerCase():text;
 if(ignoreWhitespace)out=out.replace(/[ \t]+/gu," ").replace(/ *\r?\n */gu,"\n").trim();
 return out;
}
function diffSequence(left:string[],right:string[],maxCells=150000):DiffPart[]{
 const n=left.length,m=right.length;
 if(n*m>maxCells){
   const out:DiffPart[]=[];
   for(let i=0;i<Math.max(n,m);i++){
     if(left[i]===right[i]&&left[i]!==undefined)out.push({type:"same",text:left[i]});
     else {
       if(i<n)out.push({type:"del",text:left[i]});
       if(i<m)out.push({type:"add",text:right[i]});
     }
   }
   return out;
 }
 const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)
   dp[i][j]=left[i]===right[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
 const out:DiffPart[]=[];let i=0,j=0;
 while(i<n&&j<m){
   if(left[i]===right[j]){out.push({type:"same",text:left[i]});i++;j++;}
   else if(dp[i+1][j]>=dp[i][j+1])out.push({type:"del",text:left[i++]});
   else out.push({type:"add",text:right[j++]});
 }
 while(i<n)out.push({type:"del",text:left[i++]});
 while(j<m)out.push({type:"add",text:right[j++]});
 return out;
}
export function diffLines(left:string,right:string):DiffPart[]{
 return diffSequence(left.split(/\r?\n/u),right.split(/\r?\n/u));
}
export function diffWords(left:string,right:string):DiffPart[]{
 return diffSequence(left.match(/\S+|\s+/gu)??[],right.match(/\S+|\s+/gu)??[],80000);
}
export function unifiedDiff(parts:DiffPart[]):string{
 return parts.map(p=>(p.type==="same"?" ":p.type==="add"?"+":"-")+p.text).join("\n");
}
