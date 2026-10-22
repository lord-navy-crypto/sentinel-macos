/** W3C WCAG 2.2 sRGB contrast, for two opaque solid colors only.
 * https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum
 * https://www.w3.org/WAI/WCAG21/Understanding/relative-luminance.html
 */
export type TextContrastResult={
 foreground:string;background:string;ratio:number;
 aaNormal:boolean;aaLarge:boolean;aaaNormal:boolean;aaaLarge:boolean;
};
export function normalizeHexColor(value:string):string{
 if(typeof value!=="string"||value.length>16)throw Error("请输入 #RGB 或 #RRGGBB 格式颜色。");
 const input=value.trim();
 const match=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/iu.exec(input);
 if(!match)throw Error("颜色应使用不含透明度的 #RGB 或 #RRGGBB。");
 const code=match[1].toUpperCase();
 return "#"+(code.length===3?Array.from(code,x=>x+x).join(""):code);
}
export function relativeLuminance(hex:string):number{
 const normalized=normalizeHexColor(hex);
 const values=[0,2,4].map(offset=>Number.parseInt(normalized.slice(offset+1,offset+3),16)/255);
 const channels=values.map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
 return 0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2];
}
export function wcagContrast(foreground:string,background:string):TextContrastResult{
 const fg=normalizeHexColor(foreground),bg=normalizeHexColor(background);
 const a=relativeLuminance(fg),b=relativeLuminance(bg);
 const ratio=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
 // Use unrounded ratio for pass/fail, per W3C. Only presentation rounds.
 return {foreground:fg,background:bg,ratio,
  aaNormal:ratio>=4.5,aaLarge:ratio>=3,
  aaaNormal:ratio>=7,aaaLarge:ratio>=4.5};
}
export function suggestBlackOrWhite(background:string):{foreground:string;ratio:number}{
 const onWhite=wcagContrast("#FFFFFF",background);
 const onBlack=wcagContrast("#000000",background);
 return onWhite.ratio>onBlack.ratio?
  {foreground:onWhite.foreground,ratio:onWhite.ratio}:
  {foreground:onBlack.foreground,ratio:onBlack.ratio};
}
export function contrastTextReport(result:TextContrastResult):string{
 const status=(yes:boolean)=>yes?"PASS":"NOT MET";
 return [
  "Sentinel Box · WCAG 2.2 Text Contrast (solid opaque sRGB colors)",
  "Text/foreground: "+result.foreground,
  "Background: "+result.background,
  "Contrast: "+result.ratio.toFixed(3)+":1",
  "AA normal text (4.5:1): "+status(result.aaNormal),
  "AA large text (3:1): "+status(result.aaLarge),
  "AAA normal text (7:1): "+status(result.aaaNormal),
  "AAA large text (4.5:1): "+status(result.aaaLarge),
  "Reference: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum",
  "Limitations: this checks two opaque solid colors only, not full document accessibility, image backgrounds, transparency, font size, actual rendered text or color vision differences.",
  "",
 ].join("\n");
}
