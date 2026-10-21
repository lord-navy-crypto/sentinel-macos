/** Unicode-aware text and selection metrics for the existing everyday Word Counter.
 * No background clipboard access, network, storage, or text modification.
 */
export type TextMetrics={
 words:number;characters:number;withoutWhitespace:number;utf16Units:number;codePoints:number;utf8Bytes:number;
 letters:number;latinLetters:number;hanCharacters:number;numbers:number;punctuation:number;
 symbols:number;emojiClusters:number;spaces:number;whitespace:number;lines:number;paragraphs:number;sentences:number;
 readingMinutes:number;approximateSegmentation:boolean;
};
type Segment={segment:string;isWordLike?:boolean};
type SegmenterCtor=new (locale:string,opts:{granularity:"word"|"grapheme"})=>{segment:(source:string)=>Iterable<Segment>};
const segmenter=(Intl as unknown as {Segmenter?:SegmenterCtor}).Segmenter;
const grapheme=segmenter?new segmenter("zh",{granularity:"grapheme"}):null;
const word=segmenter?new segmenter("zh",{granularity:"word"}):null;
function graphemes(text:string):string[]{
 return grapheme?[...grapheme.segment(text)].map(s=>s.segment):Array.from(text);
}
function countWords(text:string):number{
 if(word)return [...word.segment(text)].filter(s=>s.isWordLike).length;
 return (text.match(/[\p{L}\p{M}\p{N}]+/gu)??[]).length;
}
export function analyzeTextMetrics(text:string):TextMetrics{
 if(text.length>1_000_000)throw Error("Text counter supports at most 1,000,000 UTF-16 code units.");
 const clusters=graphemes(text);
 let letters=0,latinLetters=0,hanCharacters=0,numbers=0,punctuation=0,symbols=0,
  emojiClusters=0,whitespace=0,spaces=0,withoutWhitespace=0;
 for(const c of clusters){
  if(!/^\p{White_Space}+$/u.test(c))withoutWhitespace++;
  if(/\p{Extended_Pictographic}/u.test(c))emojiClusters++;
 }
 for(const codepoint of text){
  if(/\p{L}/u.test(codepoint))letters++;
  if(/\p{Script=Latin}/u.test(codepoint)&&/\p{L}/u.test(codepoint))latinLetters++;
  if(/\p{Script=Han}/u.test(codepoint))hanCharacters++;
  if(/\p{N}/u.test(codepoint))numbers++;
  if(/\p{P}/u.test(codepoint))punctuation++;
  if(/\p{S}/u.test(codepoint))symbols++;
  if(/\p{White_Space}/u.test(codepoint))whitespace++;
  if(codepoint===" "||codepoint==="\t")spaces++;
 }
 const words=countWords(text);
 const paragraphs=text.trim()?text.replace(/\r\n?/gu,"\n").trim().split(/\n\s*\n/u).filter(s=>s.trim()).length:0;
 const sentences=(text.match(/[^.!?。！？\s][^.!?。！？]*[.!?。！？]+|[^.!?。！？\s][^.!?。！？]*$/gmu)??[]).length;
 return {
  words,characters:clusters.length,withoutWhitespace,
  utf16Units:text.length,codePoints:Array.from(text).length,utf8Bytes:new TextEncoder().encode(text).length,
  letters,latinLetters,hanCharacters,numbers,punctuation,symbols,emojiClusters,spaces,whitespace,
  lines:text?text.split(/\r\n|\r|\n/u).length:0,paragraphs,sentences,
  readingMinutes:words?Math.max(1,Math.ceil(words/220)):0,approximateSegmentation:!segmenter,
 };
}
export type LengthLimit={unit:"characters"|"words";value:number;used:number;remaining:number;exceeded:boolean};
export function checkTextLimit(metrics:TextMetrics,unit:"characters"|"words",value:number):LengthLimit{
 if(!["characters","words"].includes(unit)||!Number.isSafeInteger(value)||value<1||value>1_000_000)
  throw Error("Choose a positive length limit no greater than 1,000,000.");
 const used=unit==="characters"?metrics.characters:metrics.words;
 return {unit,value,used,remaining:value-used,exceeded:used>value};
}
export function textMetricsReport(text:string,selection=""):string{
 const metrics=analyzeTextMetrics(text);
 const selected=selection?analyzeTextMetrics(selection):null;
 const fields=[["Unicode visible characters",metrics.characters],["Characters excluding whitespace",metrics.withoutWhitespace],
 ["UTF-16 units",metrics.utf16Units],["Code points",metrics.codePoints],["UTF-8 bytes",metrics.utf8Bytes],
 ["Words (locale-based)",metrics.words],["Letters (Unicode)",metrics.letters],["Latin letters",metrics.latinLetters],
 ["Han characters",metrics.hanCharacters],["Numbers",metrics.numbers],["Punctuation marks",metrics.punctuation],
 ["Symbols",metrics.symbols],["Emoji clusters",metrics.emojiClusters],["Whitespace code points",metrics.whitespace],
 ["Lines",metrics.lines],["Paragraphs",metrics.paragraphs],["Sentences (estimate)",metrics.sentences],
 ["Reading time (minutes; estimate)",metrics.readingMinutes]];
 let report="Sentinel Box · Text Counter Report\n"+fields.map(([k,v])=>k+": "+v).join("\n")+"\n";
 if(selected)report+="\nSelection: "+selected.characters+" characters; "+selected.words+" words; "+selected.utf8Bytes+" UTF-8 bytes.\n";
 report+="\nCounting: Unicode grapheme clusters when Intl.Segmenter is available; word segmentation is locale-dependent and may differ from external apps. Counting never changes the original text.\n";
 return report;
}
