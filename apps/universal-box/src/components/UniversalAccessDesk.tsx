import {useMemo,useState} from "react";
import {type AccessPreferences,type ReadingSize,DEFAULT_ACCESS} from "../lib/accessPreferences";
import {recommendLocalTools} from "../lib/toolGuide";
import {LOCAL_TOOLS} from "./ToolLaunchpad";

const EXAMPLES=[
  "把三张照片合成 PDF",
  "我要给 PDF 添加一页空白纸",
  "把 Excel 转成 CSV",
  "批量缩小好多张照片",
  "检查文件有没有重复",
  "把数据做成柱状图",
];
type Props={
  preferences:AccessPreferences;
  onChange:(next:AccessPreferences)=>void;
  onOpenTool:(view:string,module?:string)=>void;
};
export default function UniversalAccessDesk({preferences,onChange,onOpenTool}:Props){
  const [question,setQuestion]=useState(EXAMPLES[0]);
  const answer=useMemo(()=>recommendLocalTools(question,LOCAL_TOOLS),[question]);
  const setPreference=<K extends keyof AccessPreferences>(key:K,value:AccessPreferences[K])=>
    onChange({...preferences,[key]:value});
  return <section className="access-center">
    <p className="eyebrow">UNIVERSAL BOX · UNIVERSAL ACCESS</p>
    <h1>让工具更容易使用</h1>
    <p className="intro">不需要订阅、不需要了解文件格式，也不需要把私人内容发往服务器。调整可读性，然后用日常语言找到合适的工具。</p>
    <div className="access-panels">
      <section className="panel access-panel" aria-labelledby="access-settings-title">
        <p className="eyebrow">01 · READABILITY</p>
        <h2 id="access-settings-title">阅读与操作设置</h2>
        <p className="subtle">这些设置只保存在本机；不涉及账户或使用情况追踪。</p>
        <fieldset className="access-choice">
          <legend>界面文字大小</legend>
          {([["standard","标准"],["large","较大"],["extra","特大"]] as [ReadingSize,string][]).map(([size,label])=>
            <label key={size} className={preferences.reading===size?"access-size-option selected":"access-size-option"}>
              <input type="radio" name="access-reading" value={size} checked={preferences.reading===size}
                onChange={()=>setPreference("reading",size)}/>
              <span>{label}</span>
            </label>)}
        </fieldset>
        <label className="access-toggle">
          <input type="checkbox" checked={preferences.highContrast} onChange={event=>setPreference("highContrast",event.target.checked)}/>
          <span><strong>高对比度</strong><small>让边框、文本和焦点标记更加醒目</small></span>
        </label>
        <label className="access-toggle">
          <input type="checkbox" checked={preferences.simplerHome} onChange={event=>setPreference("simplerHome",event.target.checked)}/>
          <span><strong>简洁首页</strong><small>减少装饰，优先显示常用工具和大按钮；完整工具仍然保留</small></span>
        </label>
        <label className="access-toggle">
          <input type="checkbox" checked={preferences.reducedMotion} onChange={event=>setPreference("reducedMotion",event.target.checked)}/>
          <span><strong>减少动态效果</strong><small>减少卡片移动和交互动效</small></span>
        </label>
        <button type="button" className="secondary-button" onClick={()=>onChange({...DEFAULT_ACCESS})}>恢复默认设置</button>
        <p className="subtle">目前主要优化应用外壳与常见组件，不等于已通过 WCAG 全面认证。更多文字缩放仍可使用系统显示设置。</p>
      </section>
      <section className="panel access-panel" aria-labelledby="helper-heading">
        <p className="eyebrow">02 · NO-JARGON HELPER</p>
        <h2 id="helper-heading">告诉我，你想做什么？</h2>
        <p className="subtle">免费的离线关键词匹配助手，不调用云端 AI，也不读取你的个人文件。无法理解的任务会如实说明。</p>
        <label className="field-label" htmlFor="universal-helper-question">用自己的话描述目标</label>
        <textarea id="universal-helper-question" className="field text-editor" rows={3} maxLength={500} value={question}
          placeholder="例如：我想把好多张照片变小一点" onChange={event=>setQuestion(event.target.value)}/>
        <div className="access-examples" aria-label="任务示例">
          {EXAMPLES.map(example=><button type="button" className="pill" key={example} onClick={()=>setQuestion(example)}>{example}</button>)}
        </div>
        <div className="helper-results" aria-live="polite">
          <p className="eyebrow">推荐结果 · {answer.kind==="available"?"已存在工具":answer.kind==="planned"?"尚未提供":"需要更明确的描述"}</p>
          <p>{answer.message}</p>
          {answer.suggestions.map(s=><div className="helper-suggestion" key={s.id}>
            <h3>{s.name}</h3>
            <ol>{s.steps.map((step,i)=><li key={i}>{step}</li>)}</ol>
            {s.caution&&<p className="subtle"><strong>注意：</strong>{s.caution}</p>}
            <button type="button" className="primary-button" onClick={()=>onOpenTool(s.view,s.module)}>
              打开这个工具 <span aria-hidden="true">↗</span>
            </button>
          </div>)}
          {answer.kind!=="available"&&<button className="secondary-button" type="button" onClick={()=>onOpenTool("all-tools")}>查看全部现有工具</button>}
        </div>
      </section>
    </div>
    <section className="panel access-guide" aria-labelledby="access-help-title">
      <p className="eyebrow">03 · GET STARTED</p>
      <h2 id="access-help-title">3 步完成数字任务</h2>
      <div className="access-steps">
        <div><strong>1 · 描述需求</strong><p>不知道专业名称没有关系，可以先使用上面的工具助手。</p></div>
        <div><strong>2 · 检查预览</strong><p>选择自己的文件，确认大小、格式和编辑选项；遇到错误可调整重试。</p></div>
        <div><strong>3 · 保存新文件</strong><p>一般通过明确的保存对话框生成新文件，避免意外覆盖原件。</p></div>
      </div>
      <h3>键盘与隐私</h3>
      <p className="subtle"><kbd>⌘/Ctrl + K</kbd> 可搜索所有工具；<kbd>Tab</kbd> 可移动焦点；<kbd>Escape</kbd> 可关闭搜索弹窗。
        你还可以通过顶部的跳转链接直接进入正文。简易模式及字号设置只在当前设备生效。</p>
      <div className="access-links">
        <button type="button" className="secondary-button" onClick={()=>onOpenTool("data")}>打开本地备份与隐私中心</button>
        <button type="button" className="secondary-button" onClick={()=>onOpenTool("all-tools")}>浏览所有工具</button>
      </div>
    </section>
  </section>;
}
