/** Offline, deterministic tool finder. No AI service and no invented routes. */
export type AvailableTool={id:string;name:string;view:string;module?:string};
export type GuideSuggestion={id:string;name:string;view:string;module?:string;steps:string[];caution?:string};
export type GuideAnswer={kind:"available"|"planned"|"unknown";message:string;suggestions:GuideSuggestion[]};
type Recipe={id:string;patterns:RegExp[];steps:string[];caution?:string};
const recipes:Recipe[]=[
 {id:"pdf-converters",patterns:[/(图片|照片).*(转|做|成|合).*pdf/iu,/(photo|image|picture).*(to|into).*(pdf)/iu,/(png|jpeg|jpg).*(pdf)/iu,/(pdf).*转.*(图片|图像)/iu],
 steps:["打开图片与 PDF 转换工具","选择自己的文件，检查顺序和输出格式","预览结果并另存新文件"]},
 {id:"pdf-organize",patterns:[/(pdf).*(排序|重排|删除.*页|调整.*顺序)/iu,/(reorder|remove page|delete page).*pdf/iu],
 steps:["打开 PDF 页面整理","选中页码，调整顺序或移除不需要的页","另存新 PDF，保留原件"]},
 {id:"pdf-crop",patterns:[/(pdf|文档).*(裁边|裁剪|白边|边距)/iu,/(crop|trim).*(pdf)/iu],
 steps:["打开 PDF 页面裁边工具","选择页面与上下左右边距比例","另存新 PDF"],caution:"裁边只改变可见区域，并不是安全删除隐藏内容。"},
 {id:"pdf-add-blank",patterns:[/(pdf).*(空白页|添加页|插入页)/iu,/pdf.*(添加|插入).*(空白|页)/iu,/(blank page|insert pages).*pdf/iu],
 steps:["打开 PDF 空白页工具","指定插入位置、纸张尺寸与页数","保存新的 PDF 文件"]},
 {id:"pdf-fill-form",patterns:[/(pdf).*(填写|填表|表单|文本字段)/iu,/(fill|form field).*pdf/iu],
 steps:["打开 PDF 文本表单填写器","导入已有可填写 PDF，查看文本字段","填写并保存新的 PDF"],caution:"基础填写器目前仅支持英文可打印字符，不支持数字签名或复杂表单。"},
 {id:"pdf-properties",patterns:[/(pdf).*(作者|标题|属性|元数据)/iu,/(pdf).*(metadata|properties)/iu],
 steps:["打开 PDF 文件属性编辑器","核对标题、作者及关键词","修改并导出 PDF"],caution:"修改标准属性不代表完整清除文件中的隐私痕迹。"},
 {id:"image-pipeline",patterns:[/(批量|多个|多张).*(图片|照片).*(缩小|压缩|尺寸|转换|改名)/iu,/(批量|多个|多张).*(缩小|压缩|尺寸|转换|改名).*(图片|照片)/iu,/(resize|convert).*batch.*(image|photo)/iu],
 steps:["打开图片批处理工作室","选择图片、大小及格式","运行调整尺寸 → 格式转换 → 重命名 → ZIP 导出"]},
 {id:"image-difference",patterns:[/(图片|照片).*(对比|差异|比较|找不同)/iu,/(compare|difference|diff).*(image|photo)/iu],
 steps:["打开图片差异比较","选择两张相同分辨率的图片","设置容差，导出差异图或叠加图"]},
 {id:"xlsx-csv-converter",patterns:[/(excel|xlsx|csv).*(转换|转|互转)/iu,/(xlsx|excel).*(csv)/iu,/(csv).*(xlsx|excel)/iu],
 steps:["打开 Excel / CSV 转换工具","导入文件并检查表格预览","保存 XLSX、CSV 或 JSON"],caution:"这是基础表格数据转换，不会运行公式或保留复杂格式。"},
 {id:"zip-selective-export",patterns:[/(zip|压缩包).*(解压|提取|取出)/iu,/(extract|unzip).*(zip|archive)/iu],
 steps:["打开安全 ZIP 选择性导出","查看检查结果并勾选文件","保存重命名后的安全 ZIP"],caution:"不会自动将压缩包里的原路径写入文件夹，也不是防病毒扫描。"},
 {id:"duplicate-files",patterns:[/(重复文件|找重复|相同文件|文件去重|文件.*重复)/iu,/(duplicate files?|identical files?)/iu],
 steps:["打开重复文件检查器","选择需要比较的本地文件","根据 SHA-256 报告查看重复项"],caution:"不会自动删除任何文件。"},
 {id:"text-mail-merge",patterns:[/(批量).*(信|邮件|通知|邀请函)/iu,/(mail merge|merge letters)/iu],
 steps:["打开批量信函工具","提供带列名的 CSV 数据","使用 {{列名}} 模板生成 TXT ZIP"],caution:"不会替你自动发送邮件。"},
 {id:"contacts-csv-vcf",patterns:[/(通讯录|联系人).*(导出|转换|批量)/iu,/(csv).*(vcf|vcard|contacts?)/iu],
 steps:["打开 CSV 联系人转换器","导入姓名、电话等列","导出本地 .vcf 通讯录文件"]},
 {id:"charts",patterns:[/(数据|表格|csv).*(图表|可视化|柱状图|折线图)/iu,/(chart|plot|visuali[sz]).*(csv|data)/iu],
 steps:["打开数据图表工作室","导入 CSV，选择类别列和数值列","导出 SVG 图表或汇总 CSV"]},
 {id:"qr-studio-batch",patterns:[/(二维码|qr).*(制作|生成|批量|创建)/iu,/(generate|make).*(qr code)/iu],
 steps:["打开二维码工作室","选择普通文本、Wi-Fi 或联系人格式","生成并保存二维码图像"]},
 {id:"backup",patterns:[/(备份|迁移|恢复).*(数据|笔记|任务|软件)/iu,/(backup|restore).*(notes|data|workspace)/iu],
 steps:["打开备份与隐私工具","导出本地工作区备份","在新设备导入前核对目标数据"],caution:"导入工作区备份可能替换现有内容，请先导出旧数据。"},
 {id:"subtitle-converter",patterns:[/(字幕|srt|vtt).*(转换|时间|延迟|提前)/iu,/(subtitle|webvtt).*(convert|shift)/iu],
 steps:["打开字幕转换工具","选择或粘贴 SRT / WebVTT 文本","校准时间并保存新字幕文件"]},
 {id:"wav-studio",patterns:[/(wav|音频).*(裁剪|截取|淡入|淡出|音量)/iu,/(trim|normalize|fade).*(wav|audio)/iu],
 steps:["打开 WAV 音频编辑器","导入受支持的 PCM WAV","裁剪或调节音量并保存 WAV"]},
];
const planned=/(\bocr\b|扫描.*(文字|pdf|识别|表格)|图片.*(提取文字|识别文字)|图像.*(提取文字|识别文字)|识别.*(图片|扫描)|speech[- ]?to[- ]?text|语音转文字)/iu;
export function recommendLocalTools(request:string,available:readonly AvailableTool[]):GuideAnswer{
 const query=request.trim().slice(0,500);
 if(!query)return {kind:"unknown",message:"用日常语言描述目标，例如“把几张照片合成 PDF”。",suggestions:[]};
 if(planned.test(query))return {kind:"planned",message:"完整离线 OCR / 语音转文字尚未完成。Universal Box 不会把不存在的功能伪装成已经可用。",suggestions:[]};
 const matched=recipes.map((rule,i)=>({rule,i,score:rule.patterns.reduce((sum,p)=>sum+(p.test(query)?1:0),0)}))
   .filter(v=>v.score>0).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,3);
 const indexed=new Map(available.map(tool=>[tool.id,tool]));
 const suggestions=matched.flatMap(({rule})=>{
   const found=indexed.get(rule.id);
   return found?[{id:found.id,name:found.name,view:found.view,module:found.module,
     steps:[...rule.steps],caution:rule.caution}]:[];
 });
 if(!suggestions.length)return {kind:"unknown",message:"还没有找到可靠的对应工具。可以尝试更具体的关键词，或打开 All Tools 查看现有功能。",suggestions:[]};
 return {kind:"available",message:"这些建议只来自当前已经注册的本地工具。选择一个后即可打开对应工作区。",suggestions};
}
