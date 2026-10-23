import {describe,expect,it} from "vitest";
import {
 calculateExpression,appendCalculation,calculatorHistoryText,CALCULATION_HISTORY_LIMIT,
 type Calculation,
} from "./calculatorSession";
describe("Offline calculator history and controlled expression engine",()=>{
 it("keeps finite numeric answers, evaluates supported math and reuses Ans",()=>{
  const a=calculateExpression("sin(pi/2) + sqrt(16)");
  expect(a.result).toBe("5");
  expect(a.numericAns).toBe(5);
  const b=calculateExpression("Ans * 4 + 0.25",a.numericAns);
  expect(b.result).toBe("20.25");
  expect(b.numericAns).toBe(20.25);
  const c=calculateExpression("(-2)^3",b.numericAns);
  expect(c.result).toBe("-8");
 });
 it("keeps algebraic string precision in output without unconditional rounding",()=>{
  expect(calculateExpression("0.0000123000").result).toBe("0.0000123");
  expect(calculateExpression("1/3").result).toBe(String(1/3));
 });
 it("supports complex and matrix numeric results without changing last real Ans",()=>{
  const complex=calculateExpression("sqrt(-1)",3);
  expect(complex.result).toContain("i");
  expect(complex.numericAns).toBe(3);
  const matrix=calculateExpression("[1, 2; 3, 4]",3);
  expect(matrix.result).toContain("1");
  expect(matrix.numericAns).toBe(3);
 });
 it("rejects assignments, imported names, uncontrolled statements and nonfinite results",()=>{
  expect(()=>calculateExpression("x = 5")).toThrow(/Unsupported calculation syntax/);
  expect(()=>calculateExpression("sin(x)")).toThrow(/restricted variable/);
  expect(()=>calculateExpression("2;3")).toThrow(/one calculator expression/);
  expect(()=>calculateExpression("1/0")).toThrow(/not finite/);
  expect(()=>calculateExpression("import('https://example.invalid')")).toThrow(/Unsupported/);
  expect(()=>calculateExpression("a".repeat(181))).toThrow(/1–180/);
 });
 it("caps session history and produces user-visible plain text without implicit storage",()=>{
  let entries:Calculation[]=[];
  for(let i=0;i<CALCULATION_HISTORY_LIMIT+3;i++){
   entries=appendCalculation(entries,{expression:String(i),result:String(i*i)});
  }
  expect(entries).toHaveLength(CALCULATION_HISTORY_LIMIT);
  expect(entries[0]).toEqual({expression:"3",result:"9"});
  expect(calculatorHistoryText(entries).split("\n")[0]).toBe("3 = 9");
  expect(()=>appendCalculation([], {expression:"",result:"1"})).toThrow(/Incomplete/);
 });
});
