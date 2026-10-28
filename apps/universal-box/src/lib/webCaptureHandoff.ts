/** Strict local import for a user-approved browser -> Sentinel Box table handoff. No network. */
export type WebTableHandoff={
 format:"sentinel-box-web-table";schemaVersion:1;
 source:{title:string;url:string;capturedAt:string};
 table:{index:number;rows:number;columns:number;csv:string};
};
export function parseWebTableHandoff(raw:string):WebTableHandoff{
 if(raw.length>800_000)throw Error("网页交接文件过大（上限 800 KB）。");
 let input:unknown;
 try{input=JSON.parse(raw);}catch{throw Error("网页交接文件不是有效的 JSON。");}
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("交接文件结构无效。");
 const item=input as Record<string,unknown>;
 if(item.format!=="sentinel-box-web-table"||item.schemaVersion!==1)
  throw Error("文件不是兼容版本的 Sentinel Box 表格交接记录。");
 const source=item.source as Record<string,unknown>|null;
 const table=item.table as Record<string,unknown>|null;
 if(!source||typeof source!=="object"||Array.isArray(source)||
    !table||typeof table!=="object"||Array.isArray(table))
  throw Error("交接文件缺少来源或表格信息。");
 const {title,url,capturedAt}=source;
 const {index,rows,columns,csv}=table;
 if(typeof title!=="string"||title.length>300||
    typeof url!=="string"||url.length>2048||typeof capturedAt!=="string"||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(capturedAt))
  throw Error("来源元信息无效。");
 let parsed:URL;
 try{parsed=new URL(url);}catch{throw Error("来源网址格式无效。");}
 if(!["https:","http:"].includes(parsed.protocol)||parsed.username||parsed.password)
  throw Error("来源网址必须是普通 HTTP(S) 网页且不包含账户凭据。");
 if(!Number.isInteger(index)||Number(index)<0||Number(index)>=24||
    !Number.isInteger(rows)||Number(rows)<1||Number(rows)>5000||
    !Number.isInteger(columns)||Number(columns)<1||Number(columns)>100||
    typeof csv!=="string"||!csv.length||csv.length>400_000||csv.includes("\u0000"))
  throw Error("表格内容、行列数或文件大小无效。");
 return item as WebTableHandoff;
}
