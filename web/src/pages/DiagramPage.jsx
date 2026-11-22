import { useEffect, useState } from "react";
import PatternDiagram from "../components/PatternDiagram.jsx";
import { Card, LabInvented, Loading } from "../components/Bits.jsx";
import { getDiagram } from "../api";
import { visible } from "../safeText";

// Diagrams are diagram-studio/1 data loaded BY NAME from the server (rule 17); no node or edge is drawn from a list in this file.
export const DIAGRAMS = [["connect-and-link", "Connect and link"], ["grant-expire-revoke", "Grant, expire, revoke"]];

export default function DiagramPage({ lab }) {
  const [name, setName] = useState(() => { const n = window.location.hash.replace("#", "").split("/")[1]; return DIAGRAMS.some(([id]) => id === n) ? n : DIAGRAMS[0][0]; }); // "#diagram/<name>" links straight to one diagram
  const [pattern, setPattern] = useState(null);
  const [error, setError] = useState(null);
  const vertical = lab.vertical;
  useEffect(() => {
    let live = true; // a late answer for a diagram or vertical the visitor has already left is dropped
    setPattern(null); setError(null);
    getDiagram(name, vertical).then((r) => {
      if (!live) return;
      if (r.ok && Array.isArray(r.body?.nodes) && Array.isArray(r.body?.steps)) setPattern(r.body);
      else setError(r.body?.message || `HTTP ${r.status}`);
    });
    return () => { live = false; };
  }, [name, vertical]);
  return (
    <div className="stack">
      <div className="seg" role="group" aria-label="Diagram">
        {DIAGRAMS.map(([id, label]) => <button key={id} type="button" aria-pressed={name === id} onClick={() => setName(id)} data-testid={`dg-${id}`}>{label}</button>)}
      </div>
      {name === "grant-expire-revoke" && <LabInvented ids={["reaper", "reconcile-clears"]} items={lab.story?.labInvented} testId="diagram-labinv" />}
      {error && (
        <Card tone="warn" kicker="Diagram" title="This diagram could not be loaded" testId="diagram-error">
          <p role="alert" data-testid="diagram-error-text">{visible(error)}</p>
          <p className="muted">Diagrams are drawn from diagram-studio data the server serves by name (<code>{name}</code>); the page never draws a box that the data does not list.</p>
        </Card>
      )}
      {!error && !pattern && <Loading />}
      {pattern && <PatternDiagram key={`${name}-${vertical}-${lab.epoch}`} pattern={pattern} resetSignal={lab.epoch} />}
    </div>
  );
}
