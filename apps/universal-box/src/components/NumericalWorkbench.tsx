import { useState } from "react";
import { compileRealFunction, derivative, scanRoots, simpsonIntegral, tangent } from "../lib/numericalAnalysis";

type Operation = "value" | "slope" | "tangent" | "integral" | "roots" | "intersections";

export default function NumericalWorkbench({ initialFunction }: { initialFunction: string }) {
  const [expression, setExpression] = useState("x^2 - 4");
  const [other, setOther] = useState("x + 1");
  const [x, setX] = useState(2);
  const [a, setA] = useState(-3);
  const [b, setB] = useState(3);
  const [operation, setOperation] = useState<Operation>("slope");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const fmt = (n: number) => Number(n.toPrecision(9)).toString();

  function calculate() {
    setResult("");
    setError("");
    try {
      const f = compileRealFunction(expression);
      if (operation === "value") setResult(`f(${fmt(x)}) ≈ ${fmt(f(x))}`);
      else if (operation === "slope") setResult(`f'(${fmt(x)}) ≈ ${fmt(derivative(f, x))}`);
      else if (operation === "tangent") {
        const t = tangent(f, x);
        setResult(`Tangent at (${fmt(t.x)}, ${fmt(t.y)}): y ≈ ${fmt(t.slope)}x + (${fmt(t.intercept)})`);
      } else if (operation === "integral") {
        setResult(`∫ from ${fmt(a)} to ${fmt(b)} ≈ ${fmt(simpsonIntegral(f, a, b))}`);
      } else if (operation === "roots") {
        const roots = scanRoots(f, a, b);
        setResult(roots.length ? `Approximate roots: ${roots.map(fmt).join(", ")}` : "No sign-changing roots detected.");
      } else {
        const g = compileRealFunction(other);
        const roots = scanRoots(v => f(v) - g(v), a, b);
        setResult(roots.length ? "Approximate intersections: " + roots.map(v => `(${fmt(v)}, ${fmt(f(v))})`).join(", ") : "No sign-changing intersections detected.");
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  }

  return <div className="numeric-workbench">
    <h3>Local calculus & graph analysis</h3>
    <p className="subtle">Numeric derivatives, tangent lines, integrals, roots and intersections. These are approximations, not symbolic solutions.</p>
    <label className="field-label" htmlFor="numerical-expression">f(x)</label>
    <input id="numerical-expression" className="field" style={{width:"100%"}} maxLength={180} value={expression} onChange={e => setExpression(e.target.value)} />
    <div className="actions"><button type="button" className="secondary-button" onClick={() => { setExpression(initialFunction||"x"); setResult(""); }}>Use grapher Y1</button></div>
    <label className="field-label" htmlFor="numerical-operation">Operation</label>
    <select id="numerical-operation" className="field" value={operation} onChange={e => {setOperation(e.target.value as Operation);setResult("");}}>
      <option value="value">Evaluate f(x)</option>
      <option value="slope">Derivative f'(x)</option>
      <option value="tangent">Tangent line at x</option>
      <option value="integral">Definite integral</option>
      <option value="roots">Search for roots</option>
      <option value="intersections">Find intersections f(x) = g(x)</option>
    </select>
    {operation==="intersections"&&<><label className="field-label" htmlFor="numerical-other">g(x)</label><input id="numerical-other" className="field" style={{width:"100%"}} maxLength={180} value={other} onChange={e=>setOther(e.target.value)}/></>}
    <div className="tools-pair">
      {(operation==="value"||operation==="slope"||operation==="tangent")&&<label className="field-label">x position <input className="field" type="number" value={x} onChange={e=>setX(Number(e.target.value))}/></label>}
      {(operation==="integral"||operation==="roots"||operation==="intersections")&&<>
        <label className="field-label">Lower bound <input className="field" type="number" value={a} onChange={e=>setA(Number(e.target.value))}/></label>
        <label className="field-label">Upper bound <input className="field" type="number" value={b} onChange={e=>setB(Number(e.target.value))}/></label>
      </>}
    </div>
    <div className="actions"><button type="button" className="primary-button" onClick={calculate}>Calculate locally</button></div>
    {result&&<p role="status" className="analysis-result">{result}</p>}
    {error&&<p role="alert" className="subtle">Analysis error: {error}</p>}
    <p className="subtle">Intervals with discontinuities can produce misleading integrals. Root searches detect sign changes and may miss touching roots or narrow features.</p>
  </div>;
}
