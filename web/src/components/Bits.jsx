import { useState } from "react";
import { visible } from "../safeText";
import { t } from "../fmt";
// Every JSON pane is the shared JsonPane (Form | JSON, full view, rule 24); it applies visible() to everything it shows.
import Json from "./JsonPane.jsx";
export { Json };

export const HOT = ["decision", "outcome", "status", "error", "message", "ok", "expect", "met", "code"];

// A status with a word and a state, so meaning never rests on colour alone (patterns section 7).
export function Chip({ state = "none", children, testId, wrap }) {
  return <span className={`tag${wrap ? " tag--wrap" : ""}`} data-state={state} data-testid={testId}>{children}</span>;
}

export const Card = ({ tone, title, kicker, children, testId, className = "" }) => (
  <section className={`card${tone ? ` card--${tone}` : ""} ${className}`.trim()} data-testid={testId}>
    {kicker && <p className="kicker">{kicker}</p>}
    {title && <h2 className="card__title">{title}</h2>}
    {children}
  </section>
);

// The salesforce calls the mock Privilege app made for one action, each through the shared pane.
export function Hops({ hops, traceId }) {
  const list = (hops || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <details className="hops" data-testid="hops">
      <summary>Raw hops with traceparent{traceId ? ` (trace ${String(traceId).slice(0, 8)}...)` : ""} ({list.length})</summary>
      {list.map((h) => (
        <div key={h.n}>
          <h4 className="hops__title">{h.n}. {h.from} to {h.to}: {h.method} {visible(h.url)}{h.status ? ` (HTTP ${h.status})` : ""}</h4>
          <p className="muted mono">traceparent {h.traceparent}</p>
          {h.request !== undefined && <Json value={h.request} label={`hop ${h.n} request`} hot={HOT} />}
          {h.response !== undefined && <Json value={h.response} label={`hop ${h.n} response`} hot={HOT} />}
        </div>
      ))}
    </details>
  );
}

// A 5xx, no answer or a body that was not JSON is a problem with the lab server, not a refusal of what the visitor asked.
export const serverProblem = (r) => !r.ok && !r.outcome && (r.status === 0 || r.status >= 500 || ["bad_response", "unreachable", "internal_error"].includes(r.code));

// What the last action did: ok or refused, the sentence, the cause and the fix when Salesforce refused, and the raw request and response.
export function LastAction({ last, quietFor }) {
  if (!last) return null;
  const { result, op, params, response } = last;
  const quiet = quietFor === op; // the page already shows this action's refusal and outcome in its own place
  return (
    <section className="card card--neutral last" data-testid="last-action" aria-live="polite">
      <p className="kicker">Last action</p>
      <h3 className="card__title"><code>{op}</code> {result.ok ? <Chip state="ok">done</Chip> : serverProblem(result) ? <Chip state="bad">server problem (HTTP {result.status || "no answer"})</Chip> : <Chip state="bad">refused: {result.code}</Chip>}</h3>
      {!result.ok && !quiet && <p className="field-error" role="alert" data-testid="last-refusal">{visible(result.message)}</p>}
      {!result.ok && !quiet && result.outcome && <Outcome outcome={result.outcome} />}
      {result.ok && result.result?.note && <p className="lesson" data-testid="last-note">{visible(result.result.note)}</p>}
      <Json value={{ op, params }} label="request to /api/actions" hot={HOT} />
      <Json value={result.ok ? { ok: true, result: result.result } : { ok: false, error: result.code, message: result.message }} label="response" hot={HOT} />
      <Hops hops={response?.hops} traceId={response?.traceId} />
    </section>
  );
}

// A sign-in outcome from the server: what Salesforce answered (or that its wording was not captured), the cause and the exact fix.
export function Outcome({ outcome }) {
  const ok = outcome.id === "signed_in"; // a success carries no failure sentence
  const said = outcome.sfError ? `${outcome.sfError}${outcome.sfDescription ? `, "${outcome.sfDescription}"` : ""}` : null;
  return (
    <dl className="kv" data-testid="outcome">
      {!ok && said && <><dt>Salesforce said</dt><dd data-testid="outcome-said"><code>{visible(said)}</code></dd></>}
      <dt>{ok ? "What it means" : "Cause"}</dt><dd data-testid="outcome-cause">{visible(outcome.cause)}</dd>
      <dt>{ok ? "Next" : "Fix"}</dt><dd data-testid="outcome-fix">{visible(outcome.fix)}</dd>
    </dl>
  );
}

// The lab clock: the page's only way to move time. It only moves forward, so there is no control to go back (Reset starts over).
export const CLOCK_STEPS = [["+1 min", 1], ["+10 min", 10], ["+1 hour", 60], ["+1 day", 1440]];
export function LabClock({ clock, act, busy, disabled }) {
  const [custom, setCustom] = useState("");
  const n = Number(custom);
  const valid = Number.isInteger(n) && n >= 1 && n <= 800 * 1440;
  return (
    <section className="card" data-testid="lab-clock" aria-label="Lab clock">
      <p className="kicker">Lab clock</p>
      <h2 className="card__title"><span data-testid="clock-now">{t(clock?.now)} UTC</span> <span className="muted">(minute {clock?.nowMin ?? 0})</span></h2>
      <p className="muted">The clock only moves forward: there is no rewind, Reset starts over. A new Salesforce app can take up to 10 minutes to activate; moving the clock does not end a grant, deleting the policy does.</p>
      <div className="seg" role="group" aria-label="Advance the lab clock">
        {CLOCK_STEPS.map(([label, m]) => <button key={label} type="button" disabled={disabled || busy} onClick={() => act("clock.advance", { minutes: m })} data-testid={`advance-${m}`}>{label}</button>)}
      </div>
      <div className="seg">
        <label className="inline">Minutes <input type="number" min="1" max={800 * 1440} step="1" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Minutes to move the clock forward" data-testid="advance-custom" placeholder="e.g. 45" /></label>
        <button type="button" disabled={disabled || busy || !valid} onClick={() => act("clock.advance", { minutes: n }).then((r) => r.ok && setCustom(""))} data-testid="advance-custom-go">Advance</button>
      </div>
    </section>
  );
}

// Real mode only reads: the pages that act say so, deliberately, instead of showing empty tables.
export function ReadOnlyNotice({ host }) {
  return (
    <section className="card card--warn" data-testid="real-readonly">
      <p className="kicker">Real mode</p>
      <h2 className="card__title">Real only reads</h2>
      <p>Nothing on this page can act while Real is selected: the lab never grants, changes or deletes anything in a real org. Switch to Mock in the header to rehearse{host ? `, or open the Real tab to read ${host}` : ", or open the Real tab to read the org"}.</p>
    </section>
  );
}

export const Loading = () => <p className="muted" role="status">Loading...</p>;
export const CardGrid = ({ children, stats }) => <div className={`card-grid${stats ? " card-grid--stats" : ""}`}>{children}</div>;
