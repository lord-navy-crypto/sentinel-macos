import {useState,type ChangeEvent} from "react";
import {exportFile} from "../lib/output";
import {inspectEpub,epubChapterCsv,epubChapterTxt,type EpubBook} from "../lib/epubChapters";

export default function EpubChaptersDesk(){
 const [book,setBook]=useState<EpubBook|null>(null),[chapter,setChapter]=useState(0);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const current=book?.chapters[chapter];
 async function importBook(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.currentTarget.files??[]);
  event.currentTarget.value="";
  if(files.length!==1){if(files.length)setStatus("一次只能选择一本 EPUB。");return;}
  if(busy)return;
  setBusy(true);setStatus("");
  try{
   const read=await inspectEpub(files[0]);
   setBook(read);setChapter(0);
   setStatus("已在本机读取 EPUB 的 "+read.chapters.length+" 个阅读顺序章节；没有联网或加载远程资源。");
  }catch(error){
   setStatus("EPUB 无法读取，旧书籍与章节预览已保留："+String(error instanceof Error?error.message:error));
  }finally{setBusy(false);}
 }
 async function save(kind:"csv"|"txt"){
  if(!book||busy)return;
  setBusy(true);setStatus("");
  try{
   const filename=kind==="csv"?"epub-chapters-index.csv":"epub-selected-chapter.txt";
   const result=kind==="csv"?epubChapterCsv(book):epubChapterTxt(book,chapter);
   const done=await exportFile(filename,result);
   setStatus(done?"已保存 "+filename+"；来源 EPUB 未被修改。":"保存已取消，章节仍可预览。");
  }catch(error){setStatus("保存失败："+String(error instanceof Error?error.message:error));}
  finally{setBusy(false);}
 }
 return <section className="panel" data-testid="epub-desk">
  <p className="eyebrow">SENTINEL BOX · OFFLINE EBOOKS</p>
  <h2>EPUB 电子书章节查看器</h2>
  <p className="subtle">打开**未加密、无需 DRM 解锁**的 EPUB 2/3，按书籍自带阅读顺序浏览章节与文字。只显示安全的纯文本，不渲染书中的脚本、样式或远程图片。</p>
  <label className="field-label">选择一本本地 EPUB（≤12 MB，最多 120 个章节）
   <input className="field" type="file" accept=".epub,application/epub+zip"
    data-testid="epub-file" disabled={busy} onChange={event=>void importBook(event)}/>
  </label>
  <p className="subtle">不处理 DRM、加密文件或需要联网阅读的内容；仅用于您有权访问和处理的电子书。章节文字与目录在当前窗口内存处理。</p>
  {book&&<>
   <div className="metrics" data-testid="epub-stats">
    <span>书名：{book.title}</span><span>章节：{book.chapters.length}</span>
    <span>纯文字：{book.totalCharacters.toLocaleString()} 字符</span>
   </div>
   <label className="field-label">选择章节（按 EPUB 阅读顺序）
    <select className="field" data-testid="epub-chapter" disabled={busy}
     value={chapter} onChange={e=>setChapter(Number(e.target.value))}>
     {book.chapters.map((item,i)=><option value={i} key={i}>{i+1}. {item.title} · {item.characters} 字符</option>)}
    </select>
   </label>
   {current&&<>
    <p className="subtle">当前章节：{current.title} · {current.path}</p>
    <textarea className="field text-editor" data-testid="epub-text" readOnly rows={14}
     value={current.text}/>
   </>}
   <div className="actions">
    <button type="button" className="primary-button" data-testid="epub-export-txt"
     disabled={busy||!current} onClick={()=>void save("txt")}>导出当前章节 TXT</button>
    <button type="button" className="secondary-button" data-testid="epub-export-index"
     disabled={busy} onClick={()=>void save("csv")}>导出所有章节 CSV 目录</button>
    <button type="button" className="secondary-button" data-testid="epub-clear"
     disabled={busy} onClick={()=>{setBook(null);setChapter(0);setStatus("已清除本窗口的电子书预览，磁盘 EPUB 不变。");}}>清除预览</button>
   </div>
  </>}
  {status&&<p role="status" data-testid="epub-status" className="subtle">{status}</p>}
 </section>;
}
