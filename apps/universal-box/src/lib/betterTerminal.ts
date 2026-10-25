/** User-visible terminal presets only. No automatic execution, remote commands or shell injection. */
export type TerminalRecipe={id:string;title:string;description:string;command:string;modifies:boolean};
const FORMULA=/^[A-Za-z0-9][A-Za-z0-9@._+-]{0,79}$/;
export function validFormulaName(name:string):boolean {return FORMULA.test(name.trim());}
export function brewCommand(executable:string|undefined,operation:"search"|"info"|"install",name:string):string|null{
 const pkg=name.trim();
 if(!validFormulaName(pkg))return null;
 const brew=executable==="/opt/homebrew/bin/brew"||executable==="/usr/local/bin/brew"||
 executable==="/home/linuxbrew/.linuxbrew/bin/brew"?executable:"brew";
 const options=operation==="install"?"install --formula":operation;
 return brew+" "+options+" "+pkg;
}
export const TERMINAL_PRESETS:readonly TerminalRecipe[]=[
 {id:"mac-version",title:"查看 macOS 系统版本",description:"只读，检查系统版本",command:"sw_vers",modifies:false},
 {id:"developer-tools",title:"检查 Apple 开发工具",description:"检测 Command Line Tools 路径",command:"xcode-select -p",modifies:false},
 {id:"disk-free",title:"查看磁盘剩余空间",description:"只读，显示文件系统空间",command:"df -h",modifies:false},
 {id:"home-directory",title:"查看当前工作目录",description:"只读，检查本地目录",command:"pwd",modifies:false},
 {id:"brew-version",title:"检查 Homebrew 版本",description:"读取当前已安装的 Homebrew 版本",command:"brew --version",modifies:false},
 {id:"brew-list",title:"已安装的软件包",description:"列出用户安装的 formula",command:"brew list --formula",modifies:false},
 {id:"brew-doctor",title:"Homebrew 环境诊断",description:"诊断常见的配置问题",command:"brew doctor",modifies:false},
 {id:"brew-outdated",title:"检查可更新的软件包",description:"列出可更新项目，不自动升级",command:"brew outdated --formula",modifies:false},
 {id:"brew-update",title:"更新 Homebrew 软件索引",description:"联网更新 Homebrew 的包索引，需要确认",command:"brew update",modifies:true},
];
/** Plain-text log viewport only; no attempt to emulate full-screen curses/vi programs. */
export function terminalPlainText(input:string):string{
 return input.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g,"")
  .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,"")
  .replace(/\x1b\([A-Za-z0-9]/g,"")
  .replace(/\x1b\][^\x07]*$/g,"")
  .replace(/\x00/g,"").replace(/\r(?!\n)/g,"\n");
}
/** PTY transport limit is measured in UTF-8 bytes, not JavaScript UTF-16 code units. */
export const TERMINAL_INPUT_LIMIT_BYTES=4096;
export function validTerminalInput(data:string):boolean{
 return data.length>0&&new TextEncoder().encode(data).length<=TERMINAL_INPUT_LIMIT_BYTES&&!data.includes("\u0000");
}
export const TERMINAL_LOG_LIMIT=160_000;
export function boundedTerminalLog(previous:string,append:string):string{
 const merged=previous+terminalPlainText(append);
 return merged.length>TERMINAL_LOG_LIMIT?merged.slice(-TERMINAL_LOG_LIMIT):merged;
}
