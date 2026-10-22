import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {makeFolderSnapshot,folderTreeMarkdown,folderInventoryCsv,folderExtensionSummary,type FolderSnapshot} from "../lib/folderInventory";

const errorText=(value:unknown)=>value instanceof Error?value.message:String(value);

/** Files' browser-provided names, sizes and modification times are enough for this report. */
export default function FolderInventoryDesk(){
  const [snapshot,setSnapshot]=useState<FolderSnapshot|null>(null);
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("");
  const [busy,setBusy]=useState(false);
  const [treeOpen,setTreeOpen]=useState(true);
  const filtered=useMemo(()=>{
    if(!snapshot)return [];
    const q=query.trim().toLocaleLowerCase();
    return (q?snapshot.files.filter(file=>file.path.toLocaleLowerCase().includes(q)):snapshot.files).slice(0,100);
  },[snapshot,query]);
  const extensions=useMemo(()=>snapshot?folderExtensionSummary(snapshot).slice(0,12):[],[snapshot]);

  function select(event:ChangeEvent<HTMLInputElement>){
    const chosen=Array.from(event.currentTarget.files??[]);
    event.currentTarget.value="";
    if(busy||!chosen.length)return;
    try{
      const newSnapshot=makeFolderSnapshot(chosen);
      setSnapshot(newSnapshot);setQuery("");
      setStatus("已读取 "+newSnapshot.files.length+" 份文件的名称、大小和最后修改时间；没有读取文件内容。");
    }catch(e){
      setStatus("目录清单生成失败，之前的清单已保留："+errorText(e));
    }
  }
  async function save(format:"csv"|"md"){
    if(busy||!snapshot)return;
    setBusy(true);setStatus("");
    try{
      const name=format==="csv"?"sentinel-folder-inventory.csv":"sentinel-folder-tree.md";
      const text=format==="csv"?folderInventoryCsv(snapshot):folderTreeMarkdown(snapshot);
      const saved=await exportFile(name,text);
      setStatus(saved?"已保存 "+name+"；仅包含相对路径和元数据，未复制源文件。":"已取消保存，文件清单仍在此页面。");
    }catch(e){setStatus("导出失败，当前文件清单未改变："+errorText(e));}
    finally{setBusy(false);}
  }
  return <section className="panel" data-testid="folder-inventory-desk" aria-label="本地文件夹目录树与文件清单">
    <p className="eyebrow">SENTINEL BOX · EVERYDAY FILE ORGANIZATION · OFFLINE</p>
    <h2>文件夹目录树 · Folder Tree & Inventory</h2>
    <p className="subtle">选择电脑上的一个文件夹，生成可复制的 Markdown 目录树与 CSV 文件清单。只使用本地文件选择器提供的名称、相对路径、大小和修改时间；<strong>不会打开或读取文件内容，也不会上传。</strong></p>
    <div className="tools-pair">
      <label className="field-label">选择完整文件夹（最多 1,000 个文件，最多 25 层）
        <input data-testid="folder-pick-directory" className="field" type="file" multiple disabled={busy}
          {...{"webkitdirectory":""}} onChange={select}/>
      </label>
      <label className="field-label">浏览器不支持文件夹选择？改为多选文件（无目录层级）
        <input data-testid="folder-pick-files" className="field" type="file" multiple disabled={busy}
          onChange={select}/>
      </label>
    </div>
    <p className="subtle">浏览器/WebView 的文件夹选择支持程度不同。多选文件模式不会猜测丢失的子文件夹路径；出于隐私，不读取绝对磁盘路径。</p>
    {snapshot&&<>
      <div className="metrics" data-testid="folder-inventory-stats">
        <span>文件：{snapshot.files.length.toLocaleString()}</span>
        <span>子文件夹：{snapshot.folders.length.toLocaleString()}</span>
        <span>总大小：{snapshot.totalBytes.toLocaleString()} bytes</span>
      </div>
      <div className="actions">
        <button className="primary-button" type="button" data-testid="folder-export-markdown" disabled={busy} onClick={()=>void save("md")}>导出 Markdown 目录树</button>
        <button className="secondary-button" type="button" data-testid="folder-export-csv" disabled={busy} onClick={()=>void save("csv")}>导出 Excel 可打开的 CSV</button>
        <button className="secondary-button" type="button" data-testid="folder-clear" disabled={busy} onClick={()=>{setSnapshot(null);setQuery("");setStatus("已清空页面中的目录清单，原始文件未修改。");}}>清空清单</button>
      </div>
      <details open={treeOpen} onToggle={event=>setTreeOpen(event.currentTarget.open)}>
        <summary>目录树（相对路径；最多 1,000 个文件）</summary>
        <textarea aria-label="Markdown directory tree preview" className="field text-editor" data-testid="folder-tree-preview"
          readOnly value={folderTreeMarkdown(snapshot)} rows={12}/>
      </details>
      <h3>文件类型分布（按大小排序）</h3>
      <div data-testid="folder-extension-summary" className="task-list">
        {extensions.map(item=><div className="task-row" key={item.extension}>
          <span className="task-copy">{item.extension}: {item.count} 个文件 · {item.bytes.toLocaleString()} bytes</span>
        </div>)}
      </div>
      <label className="field-label">筛选文件名或相对路径（不影响导出的完整清单）
        <input className="field" data-testid="folder-search" value={query} maxLength={200}
          onChange={event=>setQuery(event.target.value)} placeholder="如 src/、.md 或合同"/>
      </label>
      <p className="subtle">预览显示最多 100 项；导出的完整清单仍包含所有已选文件，不会默默丢失剩余项目。</p>
      <div className="task-list" data-testid="folder-file-preview">
        {filtered.map(file=><div className="task-row" key={file.path}>
          <span className="task-copy">{file.path} · {file.size.toLocaleString()} bytes · {file.modified.slice(0,10)}</span>
        </div>)}
      </div>
    </>}
    {status&&<p className="subtle" role="status" data-testid="folder-inventory-status">{status}</p>}
  </section>;
}
