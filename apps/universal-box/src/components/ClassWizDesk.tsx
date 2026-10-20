import {useState} from "react";
import {
  parseComplex,complexOperation,formatComplex,parseMatrix,matrixOperation,formatMatrix,
  parseNumberList,linearRegression,normalPdf,normalCdf,binomialPmf,binomialCdf,
  type MatrixOperation,
} from "../lib/classWiz";

type Mode="complex"|"matrix"|"statistics"|"distribution";
type ComplexMode="add"|"subtract"|"multiply"|"divide"|"conjugate"|"magnitude"|"argument";
type Distribution="normal-pdf"|"normal-cdf"|"binomial-pmf"|"binomial-cdf";
const identity3="1, 0, 0\n0, 1, 0\n0, 0, 1";
const defaultA3="1, 2, 3\n0, 1, 4\n5, 6, 0";
const display=(value:number)=>String(Number(value.toPrecision(10)));
function readNumber(raw:string):number {
  if(!raw.trim())throw new Error("Complete every numeric field.");
  const n=Number(raw);
  if(!Number.isFinite(n))throw new Error("Enter finite numeric values.");
  return n;
}

export default function ClassWizDesk(){
  const [mode,setMode]=useState<Mode>("complex");
  const [complexA,setComplexA]=useState("3+4i");
  const [complexB,setComplexB]=useState("1-2i");
  const [complexMode,setComplexMode]=useState<ComplexMode>("multiply");
  const [matrixSize,setMatrixSize]=useState<2|3>(2);
  const [matrixA,setMatrixA]=useState("1, 2\n3, 4");
  const [matrixB,setMatrixB]=useState("1, 0\n0, 1");
  const [matrixMode,setMatrixMode]=useState<MatrixOperation>("inverse");
  const [xs,setXs]=useState("1, 2, 3, 4, 5");
  const [ys,setYs]=useState("3, 5, 7, 9, 11");
  const [distribution,setDistribution]=useState<Distribution>("normal-cdf");
  const [x,setX]=useState("1.96"),[mu,setMu]=useState("0"),[sigma,setSigma]=useState("1");
  const [n,setN]=useState("10"),[k,setK]=useState("3"),[p,setP]=useState("0.5");
  const [result,setResult]=useState(""),[error,setError]=useState("");
  function chooseMode(value:Mode){setMode(value);setResult("");setError("");}
  function chooseSize(value:2|3){
    setMatrixSize(value);
    setMatrixA(value===2?"1, 2\n3, 4":defaultA3);
    setMatrixB(value===2?"1, 0\n0, 1":identity3);
    setResult("");setError("");
  }
  function calculate(){
    try {
      let output="";
      if(mode==="complex"){
        const a=parseComplex(complexA);
        const needsB=["add","subtract","multiply","divide"].includes(complexMode);
        const b=needsB?parseComplex(complexB):{re:0,im:0};
        const value=complexOperation(a,b,complexMode);
        output=typeof value==="number"
          ? display(value)+(complexMode==="argument"?"°":"")
          : formatComplex(value);
      }else if(mode==="matrix"){
        const a=parseMatrix(matrixA,matrixSize);
        const needsB=["add","subtract","multiply"].includes(matrixMode);
        const b=needsB?parseMatrix(matrixB,matrixSize):a;
        const value=matrixOperation(a,b,matrixMode);
        output=typeof value==="number"?display(value):formatMatrix(value);
      }else if(mode==="statistics"){
        const sx=parseNumberList(xs),sy=parseNumberList(ys);
        const s=linearRegression(sx,sy);
        output=[
          `n = ${s.n}`,`Mean X = ${display(s.meanX)}`,`Mean Y = ${display(s.meanY)}`,
          `Sample SD X = ${display(s.sampleSdX)}`,`Sample SD Y = ${display(s.sampleSdY)}`,
          `Sample covariance = ${display(s.covariance)}`,
          `Pearson r = ${s.r===null?"undefined (constant Y)":display(s.r)}`,
          `R² = ${s.rSquared===null?"undefined (constant Y)":display(s.rSquared)}`,
          `Regression: y = ${display(s.intercept)} + (${display(s.slope)}) x`,
        ].join("\n");
      }else{
        if(distribution.startsWith("normal")){
          const val=readNumber(x),mean=readNumber(mu),sd=readNumber(sigma);
          output=(distribution==="normal-pdf"?"Normal PDF":"Normal lower-tail CDF")+" = "+
            display(distribution==="normal-pdf"?normalPdf(val,mean,sd):normalCdf(val,mean,sd));
        }else{
          const nn=readNumber(n),kk=readNumber(k),pp=readNumber(p);
          output=(distribution==="binomial-pmf"?"Binomial PMF":"Binomial P(X ≤ k)")+" = "+
            display(distribution==="binomial-pmf"?binomialPmf(nn,kk,pp):binomialCdf(nn,kk,pp));
        }
      }
      setResult(output);setError("");
    }catch(e){
      setResult("");setError(e instanceof Error?e.message:String(e));
    }
  }
  const binaryComplex=["add","subtract","multiply","divide"].includes(complexMode);
  const binaryMatrix=["add","subtract","multiply"].includes(matrixMode);
  const normal=distribution.startsWith("normal");

  return <section className="quick-math">
    <h3>Advanced calculator · ClassWiz-style local modes</h3>
    <p className="subtle">Complex arithmetic, 2×2 / 3×3 matrices, paired linear regression and probability distributions. Calculations run entirely on-device, with bounded inputs.</p>
    <div className="pill-row" role="group" aria-label="Advanced calculator mode">
      {([["complex","COMPLEX"],["matrix","MATRIX"],["statistics","STAT 2-var"],["distribution","DIST"]] as const).map(([key,label])=>
        <button type="button" key={key} className={mode===key?"pill active-pill":"pill"} onClick={()=>chooseMode(key)}>{label}</button>)}
    </div>

    {mode==="complex"&&<>
      <div className="tools-pair">
        <label className="field-label">Complex A (a+bi)
          <input className="field" value={complexA} onChange={e=>setComplexA(e.target.value)} maxLength={120} placeholder="3+4i"/>
        </label>
        {binaryComplex&&<label className="field-label">Complex B
          <input className="field" value={complexB} onChange={e=>setComplexB(e.target.value)} maxLength={120} placeholder="1-2i"/>
        </label>}
        <label className="field-label">Operation
          <select className="field" value={complexMode} onChange={e=>setComplexMode(e.target.value as ComplexMode)}>
            <option value="add">A + B</option><option value="subtract">A − B</option>
            <option value="multiply">A × B</option><option value="divide">A ÷ B</option>
            <option value="conjugate">Conjugate of A</option><option value="magnitude">|A|</option>
            <option value="argument">arg(A) in degrees</option>
          </select>
        </label>
      </div>
      <p className="subtle">Accepts 3+4i, 3-i, -i, 2e-3+4e-2i and real numbers. Argument is in degrees.</p>
    </>}

    {mode==="matrix"&&<>
      <div className="tools-pair">
        <label className="field-label">Square matrix size
          <select className="field" value={matrixSize} onChange={e=>chooseSize(Number(e.target.value) as 2|3)}>
            <option value={2}>2 × 2</option><option value={3}>3 × 3</option>
          </select>
        </label>
        <label className="field-label">Operation
          <select className="field" value={matrixMode} onChange={e=>setMatrixMode(e.target.value as MatrixOperation)}>
            <option value="add">A + B</option><option value="subtract">A − B</option><option value="multiply">A × B</option>
            <option value="transpose">Transpose A</option><option value="determinant">det(A)</option><option value="inverse">A⁻¹</option>
          </select>
        </label>
      </div>
      <div className="tools-pair">
        <label className="field-label">Matrix A · one row per line
          <textarea className="field text-editor" rows={matrixSize+1} value={matrixA} onChange={e=>setMatrixA(e.target.value)} maxLength={1000}/>
        </label>
        {binaryMatrix&&<label className="field-label">Matrix B · one row per line
          <textarea className="field text-editor" rows={matrixSize+1} value={matrixB} onChange={e=>setMatrixB(e.target.value)} maxLength={1000}/>
        </label>}
      </div>
      <p className="subtle">Use commas or spaces between cells. Singular or near-singular matrices cannot be inverted.</p>
    </>}

    {mode==="statistics"&&<>
      <div className="tools-pair">
        <label className="field-label">X values (comma / space separated)
          <textarea className="field text-editor" rows={4} maxLength={16000} value={xs} onChange={e=>setXs(e.target.value)}/>
        </label>
        <label className="field-label">Y values (same number of values)
          <textarea className="field text-editor" rows={4} maxLength={16000} value={ys} onChange={e=>setYs(e.target.value)}/>
        </label>
      </div>
      <p className="subtle">Least-squares model y = a + bx. Shows Pearson correlation, R², covariance, means and sample standard deviations. Requires 2–1000 paired observations and varying X.</p>
    </>}

    {mode==="distribution"&&<>
      <label className="field-label">Distribution operation
        <select className="field" value={distribution} onChange={e=>{setDistribution(e.target.value as Distribution);setResult("");}}>
          <option value="normal-pdf">Normal PDF · density at x</option>
          <option value="normal-cdf">Normal CDF · P(X ≤ x)</option>
          <option value="binomial-pmf">Binomial PMF · P(X = k)</option>
          <option value="binomial-cdf">Binomial CDF · P(X ≤ k)</option>
        </select>
      </label>
      {normal?<div className="tools-pair">
        <label className="field-label">x<input className="field" type="number" value={x} onChange={e=>setX(e.target.value)}/></label>
        <label className="field-label">Mean μ<input className="field" type="number" value={mu} onChange={e=>setMu(e.target.value)}/></label>
        <label className="field-label">Standard deviation σ<input className="field" type="number" min="0" value={sigma} onChange={e=>setSigma(e.target.value)}/></label>
      </div>:<div className="tools-pair">
        <label className="field-label">Number of trials n (0–200)<input className="field" type="number" min="0" max="200" step="1" value={n} onChange={e=>setN(e.target.value)}/></label>
        <label className="field-label">Successes k (integer)<input className="field" type="number" step="1" value={k} onChange={e=>setK(e.target.value)}/></label>
        <label className="field-label">Success probability p (0–1)<input className="field" type="number" min="0" max="1" step="any" value={p} onChange={e=>setP(e.target.value)}/></label>
      </div>}
      <p className="subtle">Normal CDF uses a standard numerical approximation; binomial results are computed using stable log-combinations and bounded to n ≤ 200.</p>
    </>}

    <div className="actions">
      <button className="primary-button" type="button" onClick={calculate}>Calculate</button>
      <button className="secondary-button" type="button" onClick={()=>{setResult("");setError("");}}>Clear result</button>
    </div>
    {result&&<pre className="analysis-result" role="status" aria-live="polite">{result}</pre>}
    {error&&<p className="subtle" role="alert">Calculation error: {error}</p>}
  </section>;
}
