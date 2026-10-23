/** Bounded LaTeX subset → native Word OMML, never evaluates numbers or formula text. */
import {
 Math,MathRun,MathFraction,MathRadical,MathSuperScript,MathSubScript,MathSubSuperScript,
 type MathComponent,
} from "docx";

export const MAX_EQUATION_LENGTH=1200;
export const MAX_EQUATION_NESTING=12;
const SYMBOLS:Readonly<Record<string,string>>={
 alpha:"α",beta:"β",gamma:"γ",delta:"δ",epsilon:"ε",theta:"θ",lambda:"λ",mu:"μ",
 pi:"π",rho:"ρ",sigma:"σ",tau:"τ",phi:"φ",omega:"ω",
 Gamma:"Γ",Delta:"Δ",Theta:"Θ",Lambda:"Λ",Pi:"Π",Sigma:"Σ",Phi:"Φ",Omega:"Ω",
 times:"×",cdot:"·",div:"÷",pm:"±",mp:"∓",leq:"≤",le:"≤",geq:"≥",ge:"≥",
 neq:"≠",ne:"≠",approx:"≈",equiv:"≡",infty:"∞",partial:"∂",nabla:"∇",
 sum:"∑",int:"∫",prod:"∏",rightarrow:"→",leftarrow:"←",to:"→",
 in:"∈",notin:"∉",subset:"⊂",subseteq:"⊆",forall:"∀",exists:"∃",
 };
const ESCAPED:Readonly<Record<string,string>>={"\\":"\\","{":"{","}":"}","_":"_",
 "^":"^","$":"$","%":"%","#":"#","&":"&"};
function issue(message:string):never{throw Error("Unsupported or invalid LaTeX formula: "+message);}
class Parser{
 private pos=0;
 constructor(private readonly source:string){}
 private peek(){return this.source[this.pos]??"";}
 private consume(){return this.source[this.pos++]??"";}
 private skipSpaces(){while(/\s/u.test(this.peek())&&this.pos<this.source.length)this.pos++;}
 private group(depth:number,required:boolean):MathComponent[]{
  this.skipSpaces();
  if(this.peek()==="{"){
   this.consume();
   const result=this.sequence(depth+1,"}");
   if(this.consume()!=="}")issue("unclosed curly brace.");
   return result;
  }
  if(required)issue("expected a braced argument like {x}.");
  return this.atom(depth);
 }
 private command(depth:number):MathComponent[]{
  this.consume();let word="";
  while(/[a-zA-Z]/u.test(this.peek()))word+=this.consume();
  if(!word){
   const ch=this.consume();
   if(ch&&ESCAPED[ch]!==undefined)return [new MathRun(ESCAPED[ch])];
   if(ch===","||ch===";"||ch===" ")return [new MathRun(" ")];
   issue("unknown escaped character.");
  }
  if(word==="frac"||word==="dfrac"||word==="tfrac"){
   const numerator=this.group(depth,true),denominator=this.group(depth,true);
   if(!numerator.length||!denominator.length)issue("empty fraction numerator or denominator.");
   return [new MathFraction({numerator,denominator})];
  }
  if(word==="sqrt"){
   if(this.peek()==="[")issue("indexed roots need a different converter.");
   const children=this.group(depth,true);
   if(!children.length)issue("empty square root.");
   return [new MathRadical({children})];
  }
  if(word==="left"||word==="right")return [];
  if(word==="quad"||word==="qquad")return [new MathRun(" ")];
  if(SYMBOLS[word]!==undefined)return [new MathRun(SYMBOLS[word])];
  issue("\\"+word+" is not supported; keep the original LaTeX.");
 }
 private atom(depth:number):MathComponent[]{
  if(depth>MAX_EQUATION_NESTING)issue("nesting exceeds 12 levels.");
  const ch=this.peek();
  if(!ch)return [];
  if(ch==="{")return this.group(depth,false);
  if(ch==="\\")return this.command(depth);
  if(ch==="}"||ch==="^"||ch==="_")issue("unexpected "+ch+".");
  if(ch==="$"||ch==="\n")issue("unexpected delimiter or line break.");
  if(/[0-9]/u.test(ch)){
   let numeric=this.consume();
   while(/[0-9]/u.test(this.peek()))numeric+=this.consume();
   if(this.peek()==="."){
    numeric+=this.consume();
    while(/[0-9]/u.test(this.peek()))numeric+=this.consume();
   }
   return [new MathRun(numeric)];
  }
  this.consume();
  return [new MathRun(ch)];
 }
 private sequence(depth:number,stop:string):MathComponent[]{
  if(depth>MAX_EQUATION_NESTING)issue("nesting exceeds 12 levels.");
  const result:MathComponent[]=[];
  while(this.pos<this.source.length&&this.peek()!==stop){
   const ch=this.peek();
   if(ch==="^"||ch==="_")issue("missing base before subscript/superscript.");
   if(/\s/u.test(ch)){this.skipSpaces();continue;}
   const base=this.atom(depth);
   if(!base.length)continue;
   let sub:MathComponent[]|undefined,sup:MathComponent[]|undefined;
   while(this.peek()==="^"||this.peek()==="_"){
    const kind=this.consume(),value=this.group(depth,false);
    if(!value.length)issue("empty exponent or subscript.");
    if(kind==="^"){if(sup)issue("duplicate superscript.");sup=value;}
    else {if(sub)issue("duplicate subscript.");sub=value;}
   }
   if(sub&&sup)result.push(new MathSubSuperScript({children:base,subScript:sub,superScript:sup}));
   else if(sub)result.push(new MathSubScript({children:base,subScript:sub}));
   else if(sup)result.push(new MathSuperScript({children:base,superScript:sup}));
   else result.push(...base);
  }
  return result;
 }
 parse():MathComponent[]{
  const out=this.sequence(0,"\u0000");
  if(this.pos!==this.source.length)issue("trailing unparsed input.");
  if(!out.length)issue("empty equation.");
  return out;
 }
}
export function parseLatexEquation(raw:string):MathComponent[]{
 const input=raw.trim();
 if(!input||input.length>MAX_EQUATION_LENGTH)
  issue("enter 1–1200 characters of LaTeX.");
 if(/[\u0000-\u0008\u000b-\u001f]/u.test(input))issue("control characters are not allowed.");
 return new Parser(input).parse();
}
export function latexToNativeMath(input:string):Math{
 return new Math({children:parseLatexEquation(input)});
}
export function validateMathDelimiters(markdown:string):number{
 // Additional converter safety caps; actual extraction happens in documentExport.
 if(markdown.length>50_000)throw Error("Document exceeds 50,000 characters.");
 return (markdown.match(/\$\$/gu)??[]).length;
}
