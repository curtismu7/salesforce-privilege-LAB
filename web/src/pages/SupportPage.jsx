import { useEffect, useRef, useState } from "react";
import { visible } from "../safeText";
import { t } from "../fmt";
import { BEATS, beatOf } from "../support.js";
import { refusalFor } from "./GrantPage.jsx";
import { Card, Chip, Loading, Outcome, ReadOnlyNotice, serverProblem } from "../components/Bits.jsx";
import RunObs, { headOf } from "../components/RunObs.jsx";

const END_CHOICES = [[1, "1 hour"], [2, "2 hours"], [4, "4 hours"], [8, "8 hours"], [24, "1 day"]];
const PENDING = "Revoke pending, access still live";
const PRIORITY_STATE = { P1: "bad", P2: "warn", P3: "info" };

// (a) The engineer's own Salesforce view. Denied shows no case title and no count; the cases come only from the server when the assignment exists.
function SalesforcePanel({ support, held, user }) {
  return (
    <section className="card panel--sf" data-testid="sf-panel" aria-labelledby="sf-title">
      <p className="kicker">Salesforce (mock): the engineer's view</p>
      <h2 className="card__title" id="sf-title">Cases</h2>
      <dl className="kv">
        <dt>Signed in as</dt><dd data-testid="sf-user">{visible(user.name)}, {visible(user.profile)}</dd>
        <dt>Permission sets held</dt><dd data-testid="sf-held">{held.length ? held.map((h) => <Chip key={h} state="ok">{visible(h)}</Chip>) : <span className="muted">none</span>}</dd>
      </dl>
      {support.canSeeCases ? (
        <ul className="cases" data-testid="cases-list" aria-label="Cases">{support.cases.map((c) => (
          <li key={c.id} data-testid={`case-${c.id}`}>
            <p className="cases__head"><code>{visible(c.number)}</code> <Chip state={PRIORITY_STATE[c.priority] || "none"}>{visible(c.priority)}</Chip> <span className="muted">{visible(c.status)}</span></p>
            <p className="cases__title">{visible(c.title)}</p>
            <p className="muted">{visible(c.account)}</p>
          </li>
        ))}</ul>
      ) : (
        <div className="denied" role="status" data-testid="cases-denied">
          <p className="denied__title">You don't have access to Cases</p>
        </div>
      )}
    </section>
  );
}

// (c) The old way: narrative, clearly not a Privilege claim and not driven by the engine.
function OldWayPanel({ name, set }) {
  return (
    <section className="card card--neutral" data-testid="oldway-panel" aria-labelledby="oldway-title">
      <p className="kicker">The old way</p>
      <h2 className="card__title" id="oldway-title">A permanent set nobody removes</h2>
      <p><Chip state="info" testId="oldway-tag">Narrative: not a Privilege claim</Chip></p>
      <ol className="plain" data-testid="oldway-steps">
        <li><strong>Day 0.</strong> A P1 lands. An admin assigns {visible(set)} to {visible(name)} so the case can be read.</li>
        <li><strong>Day 1.</strong> The P1 is fixed. Nobody is told to take the set away, so nobody does.</li>
        <li><strong>Month 6.</strong> {visible(name)} can still read every case. There is no end date and no receipt.</li>
      </ol>
      <dl className="kv">
        <dt>{visible(set)}</dt><dd data-testid="oldway-row">assigned by an admin, no end date, still assigned <Chip state="warn">permanent</Chip></dd>
      </dl>
    </section>
  );
}

export default function SupportPage({ lab }) {
  const { state, story, act, busy, source, runScenario } = lab;
  const [note, setNote] = useState("");
  const [hours, setHours] = useState(2);
  const [refusal, setRefusal] = useState(null);
  const [prepError, setPrepError] = useState(null);
  const prepared = useRef(false);
  const support = state?.support;
  const pristine = Boolean(state) && state.audit.length <= 1;

  // First visit in a fresh world: start from the story's own starting point (an org connected to Privilege, the engineer linked).
  useEffect(() => {
    if (source !== "mock" || !state || support?.ready || !pristine || prepared.current) return;
    prepared.current = true;
    runScenario("support-p1", 0).then((r) => { if (!r.ok) setPrepError(r.message); });
  }, [source, state, support?.ready, pristine]); // eslint-disable-line react-hooks/exhaustive-deps

  if (source === "real") return <ReadOnlyNotice host={lab.info?.realHost} />;
  if (!state || !story) return <Loading />;

  const cast = story.cast || {};
  const sf = state.salesforce;
  const pv = state.privilege;
  const beat = beatOf(support);
  const engineer = support.engineer;
  const sfUser = sf.users.find((u) => u.username === engineer?.username);
  const held = sfUser ? sf.assignments.filter((a) => a.userId === sfUser.id).map((a) => sf.permissionSets.find((s) => s.id === a.setId)?.label || a.setId) : [];
  const policy = support.access;
  const last = support.requests[support.requests.length - 1] || null;
  const set = sf.permissionSets.find((s) => s.label === support.permissionSet);
  const hint = set && sfUser ? refusalFor(set, sfUser, sf.assignments) : null;
  const rec = pv.reconcile;
  const receipts = pv.receipts.filter((r) => r.privilegeUserId === "pu-a");
  const base = Date.parse(state.clock.now);
  const endAt = new Date(base + hours * 3600_000).toISOString();

  const request = async () => {
    setRefusal(null);
    const r = await act("support.requestAccess", { note, endAt });
    if (r.ok) setNote(""); else setRefusal(r);
  };
  const end = async () => {
    setRefusal(null);
    const r = await act("policy.delete", { policyId: policy.policyId });
    if (!r.ok) setRefusal(r);
  };
  const prepare = async () => { setPrepError(null); const r = await runScenario("support-p1", 0); if (!r.ok) setPrepError(r.message); setRefusal(null); };

  return (
    <div className="stack">
      <Card kicker="Support P1" title="A support engineer, a P1, and access for the job only" testId="support-intro">
        <p className="lesson" data-testid="support-value">No standing access before or after; every grant has an end date and a receipt.</p>
        <ol className="beats" aria-label="The three beats" data-testid="beats">
          {BEATS.map((b, i) => <li key={b} data-testid={`beat-${i + 1}`} aria-current={beat === i + 1 ? "step" : undefined}><span className="step-num" aria-hidden="true">{i + 1}</span>{b}</li>)}
        </ol>
        {!support.ready && (
          <div data-testid="support-notready">
            <p className="field-error" role="status">The story needs an org connected to Privilege with {visible(cast.castAName || "the engineer")} linked. {prepError ? visible(prepError) : pristine ? "Setting the scene..." : "This world was changed on another page."}</p>
            <div className="seg"><button type="button" disabled={busy} onClick={prepare} data-testid="support-prepare">Set the scene (replaces this world)</button></div>
          </div>
        )}
        <section className="panel" aria-labelledby="request-title" data-testid="request-card">
          <h3 className="panel__sub" id="request-title">The engineer's request (the lab's own step; Privilege does not store it in this lab)</h3>
          <div className="form" aria-label="Request access">
            <label>Note for the request ({note.length} of 200)
              <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={2} aria-label="Note" data-testid="support-note" spellCheck="false" disabled={!support.ready} />
            </label>
            <label>End time (the engineer's request; these choices are the lab's own)
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="End time" data-testid="support-end" disabled={!support.ready}>
                {END_CHOICES.map(([h, text]) => <option key={h} value={h}>{text}: until {t(new Date(base + h * 3600_000).toISOString())} UTC</option>)}
              </select>
            </label>
            <p className="muted" data-testid="support-end-note">In this lab nothing ends a grant by itself; the end time is the "until" date on the receipt.</p>
            <div className="seg">
              <button type="button" className="primary" disabled={busy || !support.ready || !note.trim()} onClick={request} data-testid="support-request">Request access</button>
              <button type="button" className="danger-text" disabled={busy || !policy || policy.status !== "active"} onClick={end} data-testid="support-end-access">End access</button>
            </div>
          </div>
          {last ? (
            <p data-testid="support-last-request">Latest request: {visible(last.by)} asked for {visible(support.permissionSet)} until {t(last.endAt)} UTC: <q data-testid="support-last-note">{visible(last.note)}</q></p>
          ) : <p className="muted" data-testid="support-no-request">No request yet.</p>}
        </section>
      </Card>

      <div className="cols3">
        <SalesforcePanel support={support} held={held} user={engineer || { name: "", profile: "" }} />

        <section className="card" data-testid="privilege-panel" aria-labelledby="privilege-title">
          <p className="kicker">PingOne Privilege (mock)</p>
          <h2 className="card__title" id="privilege-title">The policy, the receipts and the reconciliation</h2>
          <h3 className="panel__sub">Policy</h3>
          <p data-testid="support-policy">{policy ? <><code>{policy.policyId}</code> <Chip state={policy.status === "active" ? "ok" : "warn"} testId="support-policy-status">{policy.status === "active" ? "Active" : PENDING}</Chip> until {t(policy.endAt)} UTC</> : <span className="muted">No active policy.</span>}</p>
          <h3 className="panel__sub">Access Receipts</h3>
          {receipts.length === 0 ? <p className="muted" data-testid="support-no-receipt">No receipts yet.</p> : (
            <ul className="plain receipts" data-testid="support-receipts">{receipts.map((r) => (
              <li key={r.id} data-testid={`support-receipt-${r.id}`}><code>{r.id}</code> {visible(r.setLabel)}, until {t(r.endAtIso)} UTC:{" "}
                {r.history.map((h, i) => <span key={`${h.status}-${i}`}>{i > 0 && " then "}<Chip state={h.status === "Granted" ? "ok" : "none"}>{h.status}</Chip></span>)}</li>
            ))}</ul>
          )}
          <p data-testid="support-rec">{rec ? <>Reconciliation, {t(rec.atIso)} UTC: <strong data-testid="support-confirmed">{rec.counts.confirmed} confirmed</strong>.</> : <span className="muted">Not reconciled yet.</span>}</p>
          <div className="seg"><button type="button" disabled={busy || !pv.app} onClick={() => act("app.reconcile").then((r) => setRefusal(r.ok ? null : r))} data-testid="support-refresh">Refresh receipts</button></div>
          <p className="muted" data-testid="support-refresh-note">In the guide the removal is queued and a refresh shows it.</p>
          {hint && <p className="muted" data-testid="support-hint">Another request now would be refused: {visible(hint)}</p>}
          {refusal && (
            <div className="field-error" role="alert" data-testid="support-refusal">
              <p>{serverProblem(refusal) ? <Chip state="bad">server problem (HTTP {refusal.status || "no answer"})</Chip> : <Chip state="bad">refused: {visible(refusal.code)}</Chip>} {visible(refusal.message)}</p>
              {refusal.outcome && <Outcome outcome={refusal.outcome} />}
            </div>
          )}
        </section>

        <OldWayPanel name={cast.castAName || "The engineer"} set={support.permissionSet || "Case Read Access"} />
      </div>
      <RunObs head={lab.last?.response ? headOf(lab.last.response) : null} loading={busy} />
    </div>
  );
}
