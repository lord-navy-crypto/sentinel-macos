"use strict";
/* No network requests, persistent storage, automatic capture, or external dependencies. */
const statusEl=document.getElementById("status");
const previewEl=document.getElementById("preview");
const buttons=[...document.querySelectorAll("button[data-mode]")];
const tablePicker=document.getElementById("tablePicker");
const tableSelect=document.getElementById("tableSelect");
const tableScan=document.getElementById("scanTables");
const tableNotice=document.getElementById("tableNotice");
function clearTableWarning(){tableNotice.hidden=true;tableNotice.textContent="";}
function showTableWarning(value){tableNotice.hidden=false;tableNotice.textContent="表格处理提示："+value;}
const sourceMeta=document.getElementById("sourceMeta");
let lastMode="text";
let lastSource="";
let scannedTables=null;

/** Runs only inside the active user-approved tab, never as a background content script. */
function inspectPageTables(){
  const visible=el=>{
    if(el.closest("[hidden],[aria-hidden='true'],[inert]"))return false;
    const style=getComputedStyle(el);
    return style.display!=="none"&&style.visibility!=="hidden";
  };
  if(!/^https?:$/.test(location.protocol))return {url:location.href,tables:[]};
  const tables=[...document.querySelectorAll("table")].filter(t=>visible(t)&&t.querySelector("tr"));
  return {
    url:location.href,
    tables:tables.slice(0,24).map((table,index)=>{
      const rows=[...table.querySelectorAll("tr")].filter(visible);
      const first=rows.find(r=>r.children?.length);
      const caption=table.querySelector("caption");
      const label=(caption?.innerText||caption?.textContent||first?.innerText||"").replace(/\s+/g," ").trim().slice(0,70);
      return {index,rows:rows.length,columns:first?[...first.children].filter(c=>c.tagName==="TH"||c.tagName==="TD").length:0,
        label:label||"未命名表格"};
    })
  };
}
function capturePage(mode,tableIndex=0){
  try {
  const LIMIT=400000;
  const clean=s=>(s||"").replace(/\u0000/g,"").trim();
  const blocked=new Set(["SCRIPT","STYLE","NOSCRIPT","TEMPLATE","SVG","CANVAS","NAV","FOOTER","HEADER"]);
  function allowed(el){
    if(el.closest("[hidden],[aria-hidden='true'],[inert]"))return false;
    const style=getComputedStyle(el);
    return style.display!=="none"&&style.visibility!=="hidden";
  }
  function csv(rows){
    let result="";
    for(const cols of rows){
      const row=cols.map(value=>{
        let cell=String(value??"").replace(/\u0000/g,"").replace(/\r?\n/g," ").trim();
        // CSV escaping does not neutralize formulas by itself.
        if(/^[=+@\-\t\r]/.test(cell))cell="'"+cell;
        return '"'+cell.replace(/"/g,'""')+'"';
      }).join(",");
      const next=(result?"\r\n":"")+row;
      // Never truncate inside a quoted cell: reject oversized CSV instead.
      if(result.length+next.length>LIMIT)throw Error("CSV 超过 400,000 字符限制；不会输出被截断的表格。");
      result+=next;
    }
    return result;
  }
  const root=document.querySelector("main article,article,main,[role='main']")||document.body;
  if(!root)throw Error("此页面没有可提取的正文。");
  if(mode==="source"){
    const title=clean(document.title).slice(0,500);
    const url=location.href;
    if(!/^https?:\/\//i.test(url))throw Error("仅支持 http(s) 网页。");
    return ("标题: "+title+"\n来源: "+url).slice(0,LIMIT);
  }
  if(mode==="outline"){
    const headings=[...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(allowed).slice(0,250);
    if(!headings.length)throw Error("当前页面没有可访问的标题。");
    return headings.map(el=>"  ".repeat(Number(el.tagName[1])-1)+
      "- "+clean(el.innerText||el.textContent).replace(/\s+/g," ").slice(0,500)).join("\n").slice(0,LIMIT);
  }
  if(mode==="text"){
    const clone=document.body.cloneNode(true);
    clone.querySelectorAll("script,style,noscript,template,svg,canvas").forEach(el=>el.remove());
    return clean(document.body.innerText||clone.textContent).slice(0,LIMIT);
  }
  if(mode==="links"){
    const rows=[["text","url"]],seen=new Set();
    for(const a of document.querySelectorAll("a[href]")){
      if(!allowed(a))continue;
      const url=a.href;
      if(!/^https?:\/\//i.test(url)||seen.has(url))continue;
      seen.add(url);rows.push([clean(a.innerText||a.textContent).slice(0,300),url]);
      if(rows.length>2001)break;
    }
    return csv(rows);
  }
  if(mode==="tables"){
    const tables=[...document.querySelectorAll("table")].filter(el=>allowed(el)&&el.querySelector("tr"));
    if(!Number.isInteger(tableIndex)||tableIndex<0||tableIndex>=Math.min(tables.length,24))
      throw Error("表格序号无效，请重新扫描当前网页。");
    const table=tables[tableIndex];
    const allRows=[...table.querySelectorAll("tr")].filter(allowed);
    if(allRows.length>5000)throw Error("表格超过 5,000 行，无法保证完整导出。");
    const rows=[];
    for(const row of allRows){
      if(!allowed(row))continue;
      const cells=[...row.children].filter(cell=>["TH","TD"].includes(cell.tagName));
      if(!cells.length)continue;
      if(cells.some(cell=>(cell.colSpan||1)!==1||(cell.rowSpan||1)!==1))
        throw Error("该表格包含合并单元格，暂不支持无损 CSV 导出。");
      rows.push(cells.map(cell=>{
        const value=clean(cell.innerText||cell.textContent);
        if(value.length>20000)throw Error("单个表格单元格超过 20,000 字符，无法无损导出。");
        return value;
      }));

    }
    if(!rows.length)throw Error("此表格没有可用数据行。");
    return csv(rows);
  }
  const out=[];
  let used=0;
  function add(value){
    if(used>=LIMIT)return;
    const part=value.slice(0,LIMIT-used);
    out.push(part);
    used+=part.length;
  }
  const walk=(node,depth=0)=>{
    if(used>=LIMIT||depth>36)return;
    if(node.nodeType===Node.TEXT_NODE){
      const value=clean(node.nodeValue).replace(/\s+/g," ");
      if(value)add(value+" ");
      return;
    }
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    const el=node,tag=el.tagName;
    if(blocked.has(tag)||!allowed(el))return;
    if(tag==="BR"){add("\n");return;}
    if(tag==="IMG")return;
    if(/^H[1-6]$/.test(tag)){
      add("\n\n"+"#".repeat(Number(tag[1]))+" "+clean(el.innerText).replace(/\s+/g," ")+"\n\n");return;
    }
    if(tag==="A"){
      const label=clean(el.innerText).replace(/\s+/g," ").replace(/[\[\]]/g,"");
      const href=el.href;
      if(label)add(/^https?:\/\//i.test(href)?"["+label+"]("+href.replace(/[()]/g,encodeURIComponent)+")":label);
      return;
    }
    if(tag==="LI"){add("\n- ");}
    if(["P","DIV","SECTION","ARTICLE","UL","OL","BLOCKQUOTE","TR"].includes(tag))add("\n");
    for(const child of el.childNodes)walk(child,depth+1);
    if(["P","DIV","SECTION","ARTICLE","UL","OL","BLOCKQUOTE","TR"].includes(tag))add("\n");
  };
  walk(root);
  return out.join("").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim().slice(0,LIMIT);
  } catch(error) {
    // chrome.scripting.executeScript normally drops the exception text from
    // errors thrown in the target tab. Return a structured error to preserve
    // the precise explanation in the extension popup.
    return {__captureError:error?.message||String(error)};
  }
}
async function activeTab(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!/^https?:\/\//i.test(tab.url||""))
    throw Error("仅可读取当前有授权的普通 http(s) 网页。");
  return tab;
}
async function scanTables(tab){
  const results=await chrome.scripting.executeScript({
    target:{tabId:tab.id},func:inspectPageTables
  });
  const metadata=results?.[0]?.result;
  if(!metadata||metadata.url!==tab.url||!Array.isArray(metadata.tables))
    throw Error("页面已变化，请重新扫描表格。");
  if(metadata.tables.length===0){
    scannedTables=null;
    tablePicker.hidden=true;
    throw Error("当前页面没有可提取的可见 HTML 表格。");
  }
  scannedTables={tabId:tab.id,url:tab.url,count:metadata.tables.length};
  tableSelect.replaceChildren();
  for(const item of metadata.tables){
    const option=document.createElement("option");
    option.value=String(item.index);
    option.textContent="#"+(item.index+1)+" · "+item.rows+" 行 × "+item.columns+" 列 · "+item.label;
    tableSelect.appendChild(option);
  }
  tableSelect.value="0";
  tablePicker.hidden=false;
  return metadata.tables.length;
}
tableScan.addEventListener("click",async()=>{
  tableScan.disabled=true;
  clearTableWarning();
  statusEl.textContent="正在扫描当前页表格…";
  try{
    const tab=await activeTab();
    const count=await scanTables(tab);
    statusEl.textContent="已发现 "+count+" 个表格。请选择正确的表格，再点击复制 CSV 或一键保存。";
  }catch(error){const message=error?.message||String(error);showTableWarning(message);statusEl.textContent="扫描失败："+message;}
  finally{tableScan.disabled=false;}
});
async function perform(mode,saveDirectly=false){
  buttons.forEach(b=>b.disabled=true);
  tableScan.disabled=true;
  statusEl.textContent="正在提取…";
  if(mode==="tables")clearTableWarning();
  try{
    const tab=await activeTab();
    let tableIndex=0;
    if(mode==="tables"){
      if(!scannedTables||scannedTables.tabId!==tab.id||scannedTables.url!==tab.url){
        const count=await scanTables(tab);
        if(count>1){
          statusEl.textContent="发现 "+count+" 个表格。请先从下拉框选择目标表格，再点击此按钮。";
          tableSelect.focus();
          return;
        }
      }
      tableIndex=Number(tableSelect.value);
      if(!Number.isInteger(tableIndex)||tableIndex<0||tableIndex>=scannedTables.count)
        throw Error("表格选择无效，请重新扫描。");
    }
    const results=await chrome.scripting.executeScript({
      target:{tabId:tab.id},func:capturePage,args:[mode,tableIndex]
    });
    const extracted=results?.[0]?.result;
    if(extracted&&typeof extracted==="object"&&typeof extracted.__captureError==="string")
      throw Error(extracted.__captureError);
    const text=typeof extracted==="string"?extracted:"";
    if(!text)throw Error("没有找到可提取的内容。");
    previewEl.value=text;
    lastMode=mode;
    lastSource=tab.url;
    const domain=new URL(tab.url).hostname;
    sourceMeta.textContent="来源："+domain+" · 格式："+(mode==="tables"?"CSV 表格 #"+(tableIndex+1):mode)+" · "+text.length.toLocaleString()+" 字符";
    const cutOff=text.length>=400000 && mode!=="links"&&mode!=="tables";
    if(saveDirectly){
      saveCaptured(text,mode);
      statusEl.textContent="已触发浏览器本地下载："+text.length.toLocaleString()+" 字符。"+(cutOff?"注意：长文本可能在上限处截断。":"")+"请在下载列表确认保存完成。";
      return;
    }
    try{
      await navigator.clipboard.writeText(text);
      statusEl.textContent="已复制到剪贴板 · "+text.length.toLocaleString()+" 字符。"+(cutOff?"注意：长文本可能截断。":"");
    }catch{
      statusEl.textContent="剪贴板权限被浏览器拒绝；提取成功，可使用下方“复制预览”或保存文件。";
      previewEl.focus();previewEl.select();
    }
  }catch(error){const message=error?.message||String(error);if(mode==="tables")showTableWarning(message);statusEl.textContent="提取失败："+message+"。原有预览未被覆盖。";}
  finally{buttons.forEach(b=>b.disabled=false);tableScan.disabled=false;}
}
buttons.forEach(button=>button.addEventListener("click",()=>void perform(button.dataset.mode,button.dataset.save==="true")));
document.getElementById("copyPreview").addEventListener("click",async()=>{
  if(!previewEl.value){statusEl.textContent="没有可复制的预览，请先提取。";return;}
  try{await navigator.clipboard.writeText(previewEl.value);statusEl.textContent="预览内容已复制。";}
  catch{previewEl.focus();previewEl.select();statusEl.textContent="浏览器拒绝复制，可使用文本框的手动复制。";}
});
/** Offline formatting on the explicitly captured preview, never on page source. */
function tidyText(text){
  return text.replace(/\r\n?/g,"\n").replace(/[\u00a0\u202f]/g," ")
    .split("\n").map(line=>line.replace(/[ \t]{2,}/g," ").trim())
    .join("\n").replace(/\n{3,}/g,"\n\n").trim();
}
document.getElementById("clean").addEventListener("click",async()=>{
  if(!previewEl.value){statusEl.textContent="请先提取内容。";return;}
  if(lastMode==="links"||lastMode==="tables"){statusEl.textContent="CSV 不做空格清理，以免破坏数据。";return;}
  previewEl.value=tidyText(previewEl.value);
  try{await navigator.clipboard.writeText(previewEl.value);statusEl.textContent="已整理并复制文字。";}
  catch{statusEl.textContent="已整理预览内容，可手动复制。";}
});
function saveCaptured(value,mode){
  if(!value)throw Error("没有可保存的内容。");
  const ext=mode==="links"||mode==="tables"?"csv":mode==="markdown"?"md":"txt";
  const mime=ext==="csv"?"text/csv":ext==="md"?"text/markdown":"text/plain";
  const blob=new Blob(["\uFEFF",value],{type:mime+";charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
  let host="web";
  try{if(lastSource)host=new URL(lastSource).hostname.toLowerCase().replace(/[^a-z0-9.-]/g,"-").slice(0,60)||"web";}catch{}
  anchor.href=url;
  anchor.download="universal-box-"+host+"-"+mode+"-"+stamp+"."+ext;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.getElementById("save").addEventListener("click",()=>{
  if(!previewEl.value){statusEl.textContent="请先提取内容。";return;}
  saveCaptured(previewEl.value,lastMode);
  statusEl.textContent="已触发本地文件下载，原网页未修改。";
});

document.getElementById("print").addEventListener("click",async()=>{
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id||!/^https?:\/\//i.test(tab.url||""))throw Error("只能打印有权限访问的网页。");
    await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>window.print()});
    statusEl.textContent="已请求浏览器打印对话框；可在其中选择保存为 PDF。";
  }catch(e){statusEl.textContent="无法打印此页面："+(e?.message||String(e));}
});
