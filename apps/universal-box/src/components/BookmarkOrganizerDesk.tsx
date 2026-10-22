import {useMemo,useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {
  parseBookmarkHtml,bookmarkDeduplicate,bookmarksCsv,bookmarksMarkdown,bookmarkDomainSummary,
  type BookmarkReport,
} from "../lib/bookmarkImport";

const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);

export default function BookmarkOrganizerDesk(){
  const [report,setReport]=useState<BookmarkReport|null>(null);
  const [sourceName,setSourceName]=useState("");
  const [search,setSearch]=useState("");
  const [removeDuplicates,setRemoveDuplicates]=useState(false);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const list=useMemo(()=>report?(removeDuplicates?bookmarkDeduplicate(report.items):report.items):[],[report,removeDuplicates]);
  const shown=useMemo(()=>{
    const term=search.trim().toLocaleLowerCase();
    return (term?list.filter(item=>(item.title+" "+item.url+" "+item.domain).toLocaleLowerCase().includes(term)):list).slice(0,80);
  },[list,search]);
  const summary=useMemo(()=>bookmarkDomainSummary(list).slice(0,10),[list]);

  async function readBookmarks(event:ChangeEvent<HTMLInputElement>){
    const selected=Array.from(event.currentTarget.files??[]);
    event.currentTarget.value="";
    if(busy||!selected.length)return;
    if(selected.length!==1){setStatus("只能选择一个导出的 HTML 书签文件。");return;}
    const file=selected[0];
    if(!/\.html?$/iu.test(file.name)||file.size<20||file.size>2_000_000){
      setStatus("请选择 20 bytes–2 MB 的浏览器书签 HTML 文件；原清单未改变。");return;
    }
    setBusy(true);setStatus("");
    try{
      const parsed=parseBookmarkHtml(await file.text());
      setReport(parsed);setSourceName(file.name);setSearch("");setRemoveDuplicates(false);
      setStatus("从 "+file.name+" 读取 "+parsed.items.length+" 条 HTTP(S) 书签，找到 "+parsed.duplicates+" 条重复网址；没有访问任何网站。");
    }catch(e){setStatus("读取书签失败，原清单已保留："+errorText(e));}
    finally{setBusy(false);}
  }
  async function save(kind:"csv"|"md"){
    if(busy||!list.length)return;
    setBusy(true);setStatus("");
    try{
      const name=kind==="csv"?"sentinel-bookmarks.csv":"sentinel-bookmarks.md";
      const contents=kind==="csv"?bookmarksCsv(list):bookmarksMarkdown(list);
      const ok=await exportFile(name,contents);
      setStatus(ok?"已保存 "+list.length+" 条本地书签到 "+name+"；未打开链接或上传文件。":"已取消保存。");
    }catch(e){setStatus("书签导出失败，原始书签未修改："+errorText(e));}
    finally{setBusy(false);}
  }
  return <section className="panel" data-testid="bookmark-organizer" aria-label="离线浏览器书签整理">
    <p className="eyebrow">SENTINEL BOX · PRIVATE EVERYDAY TOOLS</p>
    <h2>浏览器书签整理 · Offline Bookmark Organizer</h2>
    <p className="subtle">把浏览器导出的书签 HTML 文件导入这里，快速查看重复书签、搜索标题与域名、导出 CSV 或 Markdown。整个过程只在本机进行，<strong>不会自动访问、验证或打开任何网址。</strong></p>
    <label className="field-label">选择 Chrome / Firefox / Safari 等导出的 HTML 书签文件（具体格式需符合 HREF 锚点导出结构）
      <input className="field" data-testid="bookmarks-input" type="file" accept=".htm,.html,text/html"
        disabled={busy} onChange={event=>void readBookmarks(event)}/>
    </label>
    <p className="subtle">仅处理文件中的 HTTP/HTTPS 书签。跳过 file:、javascript:、data: 等网址及包含账号密码的网址；不改变源文件。请勿将私人书签清单随意公开分享。</p>
    {report&&<>
      <div data-testid="bookmarks-stats" className="metrics">
        <span>来源：{sourceName}</span>
        <span>有效书签：{report.items.length}</span>
        <span>重复网址：{report.duplicates}</span>
        <span>跳过的非网页链接：{report.skipped}</span>
      </div>
      <label><input data-testid="bookmarks-dedupe" type="checkbox" checked={removeDuplicates}
        onChange={e=>setRemoveDuplicates(e.target.checked)}/> 导出时去掉重复网址（默认关闭；不修改源文件）</label>
      <p className="subtle" data-testid="bookmarks-export-count">当前将导出 {list.length} 条书签。去重只按规范化后的完整网址，不删去参数不同的链接。</p>
      <div className="actions">
        <button type="button" className="primary-button" data-testid="bookmarks-export-csv"
          disabled={busy} onClick={()=>void save("csv")}>导出 CSV 书签清单</button>
        <button type="button" className="secondary-button" data-testid="bookmarks-export-md"
          disabled={busy} onClick={()=>void save("md")}>导出 Markdown 链接</button>
        <button type="button" className="secondary-button" data-testid="bookmarks-clear"
          disabled={busy} onClick={()=>{setReport(null);setSourceName("");setSearch("");setRemoveDuplicates(false);setStatus("已清空当前会话的书签列表；浏览器原书签未更改。");}}>清空清单</button>
      </div>
      <h3>最常出现的域名</h3>
      <div className="task-list" data-testid="bookmarks-domains">
        {summary.map(group=><div className="task-row" key={group.domain}>
          <span className="task-copy">{group.domain} · {group.count} 条</span>
        </div>)}
      </div>
      <label className="field-label">搜索书签标题或网址（仅筛选屏幕预览）
        <input className="field" data-testid="bookmarks-search" maxLength={250}
          value={search} onChange={e=>setSearch(e.target.value)} placeholder="例：project、docs、example.com"/>
      </label>
      <p className="subtle">屏幕最多显示 80 条；导出的文件始终包含当前去重选项下的所有书签，不因搜索条件而漏项。</p>
      <div data-testid="bookmarks-rows" className="task-list">
        {shown.map((item,index)=><div className="task-row" key={index}>
          <span className="task-copy"><strong>{item.title}</strong> · {item.domain} · {item.url}</span>
        </div>)}
      </div>
    </>}
    {status&&<p className="subtle" role="status" data-testid="bookmarks-status">{status}</p>}
  </section>;
}
