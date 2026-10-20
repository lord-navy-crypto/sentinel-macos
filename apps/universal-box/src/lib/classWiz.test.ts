import {describe,it,expect} from "vitest";
import {
  parseComplex,complexOperation,formatComplex,parseMatrix,matrixOperation,formatMatrix,
  parseNumberList,linearRegression,normalPdf,normalCdf,binomialPmf,binomialCdf,
} from "./classWiz";

describe("Daily Desk advanced ClassWiz modes",()=>{
  it("parses complex number forms without silently accepting malformed input",()=>{
    expect(parseComplex("3+4i")).toEqual({re:3,im:4});
    expect(parseComplex("3-i")).toEqual({re:3,im:-1});
    expect(parseComplex("-i")).toEqual({re:0,im:-1});
    expect(parseComplex("2e-3+4e-2i")).toEqual({re:0.002,im:0.04});
    expect(parseComplex("5")).toEqual({re:5,im:0});
    expect(()=>parseComplex("3+garbagei")).toThrow();
    expect(()=>parseComplex("Infinity")).toThrow();
  });
  it("evaluates complex arithmetic including safe zero division",()=>{
    const a=parseComplex("3+4i"),b=parseComplex("1-2i");
    expect(complexOperation(a,b,"add")).toEqual({re:4,im:2});
    expect(complexOperation(a,b,"multiply")).toEqual({re:11,im:-2});
    const quotient=complexOperation(a,b,"divide");
    expect(quotient).toEqual({re:-1,im:2});
    expect(complexOperation(a,b,"magnitude")).toBe(5);
    expect(complexOperation({re:0,im:1},b,"argument")).toBe(90);
    expect(formatComplex({re:3,im:-1})).toBe("3 − i");
    expect(()=>complexOperation(a,{re:0,im:0},"divide")).toThrow(/zero/);
  });
  it("does 2x2 and 3x3 matrix arithmetic, inverses and singular checks",()=>{
    const a=parseMatrix("1, 2\n3, 4",2),identity=parseMatrix("1 0;0 1",2);
    expect(matrixOperation(a,identity,"multiply")).toEqual(a);
    expect(matrixOperation(a,identity,"add")).toEqual([[2,2],[3,5]]);
    expect(matrixOperation(a,identity,"transpose")).toEqual([[1,3],[2,4]]);
    expect(matrixOperation(a,identity,"determinant")).toBe(-2);
    const inverse=matrixOperation(a,identity,"inverse");
    (inverse as number[][]).forEach((row,i)=>row.forEach((value,j)=>expect(value).toBeCloseTo([[-2,1],[1.5,-0.5]][i][j],10)));
    expect(formatMatrix(a)).toContain("1\t2");
    const m=parseMatrix("1 2 3\n0 1 4\n5 6 0",3);
    expect(matrixOperation(m,m,"determinant")).toBeCloseTo(1);
    const inv3=matrixOperation(m,m,"inverse") as number[][];
    const product=matrixOperation(m,inv3,"multiply") as number[][];
    product.forEach((row,i)=>row.forEach((x,j)=>expect(x).toBeCloseTo(i===j?1:0,8)));
    expect(()=>matrixOperation([[1,2],[2,4]],identity,"inverse")).toThrow(/singular/);
    expect(()=>parseMatrix("1,2,3",2)).toThrow();
    expect(()=>parseMatrix("1,2\n3,NaN",2)).toThrow();
  });
  it("computes two-variable least squares regression and checks degeneracy",()=>{
    const a=linearRegression([1,2,3,4],[3,5,7,9]);
    expect(a.n).toBe(4);
    expect(a.slope).toBeCloseTo(2);
    expect(a.intercept).toBeCloseTo(1);
    expect(a.r).toBeCloseTo(1);
    expect(a.rSquared).toBeCloseTo(1);
    expect(a.covariance).toBeCloseTo(10/3);
    expect(linearRegression([1,2,3],[4,4,4]).r).toBeNull();
    expect(()=>linearRegression([1,1,1],[2,3,4])).toThrow(/X must vary/);
    expect(()=>linearRegression([1,2],[1])).toThrow();
    expect(parseNumberList("1, 2\n3;4")).toEqual([1,2,3,4]);
    expect(()=>parseNumberList("1, no, 3")).toThrow();
  });
  it("calculates normal and binomial probabilities with parameter validation",()=>{
    expect(normalPdf(0)).toBeCloseTo(1/Math.sqrt(2*Math.PI),8);
    expect(normalCdf(0)).toBeCloseTo(.5,6);
    expect(normalCdf(1.96)).toBeCloseTo(.975002,5);
    expect(normalCdf(-1.96)).toBeCloseTo(.024998,5);
    expect(()=>normalPdf(0,0,0)).toThrow();
    expect(binomialPmf(10,3,.5)).toBeCloseTo(120/1024,10);
    expect(binomialCdf(10,3,.5)).toBeCloseTo(176/1024,10);
    expect(binomialPmf(10,0,0)).toBe(1);
    expect(binomialCdf(10,10,.5)).toBe(1);
    expect(binomialPmf(10,-1,.5)).toBe(0);
    expect(()=>binomialPmf(201,0,.5)).toThrow();
    expect(()=>binomialCdf(10,5,1.5)).toThrow();
  });
});
