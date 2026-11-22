import { useState } from "react";
import FloatingDialog from "../floating-dialog/FloatingDialog.jsx";
import { visible } from "../safeText";
import { t } from "../fmt";
import { Card, CardGrid, Chip, LabClock, LastAction, Loading, ReadOnlyNotice } from "../components/Bits.jsx";

// What Privilege answers for a set and a user (the guide's three rules, in the engine's order). Shown BEFORE a grant is tried; the server's own
// sentence is what a refusal really shows.
export function refusalFor(set, user, assignments) {
  if (user && assignments.some((a) => a.userId === user.id && a.setId === set.id)) return "Already has this permission set";
  if (set.needsPsl) return "Needs a permission set license";
  if (set.userLicense && user && set.userLicense !== user.license) return `License ${user.license} ≠ ${set.userLicense}`;
  if (set.userLicense && !user) return `License Salesforce ≠ ${set.userLicense}`;
  return null;
}

const POLICY_CHIP = {
  active: ["ok", "Active"],
  revoke_pending: ["warn", "Revoke pending, access still live"],
};
const RECEIPT_STATE = { Granted: "ok", "Expired / Revoked": "none" };
const COUNTS = [["confirmed", "Confirmed"]];

function GrantDialog({ lab, app, linked, sets, assignments, sfUsers, onClose }) {
  const { act, busy } = lab;
  const [user, setUser] = useState(linked[0]?.privilegeUserId || "");
  const [setId, setSetId] = useState(sets[0]?.id || "");
  const [dur, setDur] = useState("60");
  const [refusal, setRefusal] = useState(null);
  const row = linked.find((r) => r.privilegeUserId === user);
  const sfu = row && sfUsers.find((u) => u.id === row.sfUserId);
  const set = sets.find((s) => s.id === setId);
  const hint = set ? refusalFor(set, sfu, assignments) : null;
  const submit = async () => {
    setRefusal(null);
    const r = await act("policy.grant", { privilegeUserId: user, permSetId: setId, durationMin: Number(dur) });
    if (r.ok) onClose(); else setRefusal(r);
  };
  return (
    <FloatingDialog isOpen onClose={onClose} title="Grant Permission" ariaLabel="Grant Permission" storageKey="sfp-grant-dialog" singletonKey="sfp-grant" testId="grant-dialog" defaultWidth={460} defaultHeight={null}>
      <div className="form">
        <label>User
          <select value={user} onChange={(e) => setUser(e.target.value)} aria-label="User" data-testid="grant-user">
            {linked.map((r) => <option key={r.privilegeUserId} value={r.privilegeUserId}>{visible(r.name)}</option>)}
          </select>
        </label>
        <label>Permission set
          <select value={setId} onChange={(e) => setSetId(e.target.value)} aria-label="Permission set" data-testid="grant-set">
            {sets.map((s) => <option key={s.id} value={s.id}>{visible(s.label)}</option>)}
          </select>
        </label>
        <label>Duration (minutes)
          <input type="number" min="1" max={366 * 1440} step="1" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} aria-label="Duration in minutes" data-testid="grant-duration" />
        </label>
        <p className="muted">The grant carries a duration and an end date, which the receipt shows. Deleting the policy is what removes the access.</p>
        {hint && <p className="field-error" data-testid="grant-hint" role="note">Expect a refusal: {visible(hint)}</p>}
        {refusal && <p className="field-error" role="alert" data-testid="grant-refusal">{refusal.code}: {visible(refusal.message)}</p>}
        <div className="seg">
          <button type="button" className="primary" disabled={busy || !user || !setId || !Number.isInteger(Number(dur)) || Number(dur) < 1} onClick={submit} data-testid="grant-submit">Grant</button>
        </div>
      </div>
    </FloatingDialog>
  );
}

export default function GrantPage({ lab }) {
  const { state, act, busy, source, last } = lab;
  const [open, setOpen] = useState(false);
  if (source === "real") return <ReadOnlyNotice host={lab.info?.realHost} />;
  if (!state) return <Loading />;
  const { salesforce: sf, privilege: pv } = state;
  const app = pv.app;
  const sets = app?.permissions || [];
  const linked = pv.users.filter((r) => r.status === "linked");
  const rec = pv.reconcile;
  const live = pv.policies.filter((p) => p.status !== "ended");
  const ended = pv.policies.filter((p) => p.status === "ended");
  const setLabel = (id) => sf.permissionSets.find((s) => s.id === id)?.label || id;
  const userName = (id) => sf.users.find((u) => u.id === id)?.name || id;

  return (
    <div className="stack">
      <Card kicker="Grant and revoke" title="A permission set with a duration, removed by deleting its policy" testId="grant-intro">
        <p data-testid="intro-observed">Access is granted through a policy on the application and removed by deleting that policy: there is no Revoke button.</p>
        <div className="seg">
          <button type="button" className="primary" disabled={busy || !app || linked.length === 0 || sets.length === 0} onClick={() => setOpen(true)} data-testid="open-grant">Grant Permission</button>
          <button type="button" disabled={busy || !app} onClick={() => act("app.sync")} data-testid="grant-sync">Sync</button>
          <button type="button" disabled={busy || !app} onClick={() => act("app.reconcile")} data-testid="reconcile">Refresh receipts</button>
        </div>
        {!app && <p className="muted" data-testid="grant-no-app">There is no application yet. <a href="#connect">Connect</a> the org, then <a href="#link">Link</a> a user.</p>}
        {app && linked.length === 0 && <p className="muted" data-testid="grant-no-linked">Nobody is linked yet: only a linked user can be granted a permission. <a href="#link">Add Users, then Sync</a>.</p>}
      </Card>

      <div className="cols">
        <LabClock clock={state.clock} act={act} busy={busy} />
        <Card kicker="Permissions" title={`Permission sets (${sets.length})`} testId="permissions">
          {sets.length === 0 ? <p className="muted" data-testid="no-sets">The Permissions list is empty until the application exists and a Sync has read the org.</p> : (
            <div className="scroll"><table className="tbl tbl--wide">
              <thead><tr><th>Permission set</th><th>Licence</th><th>What Privilege says</th></tr></thead>
              <tbody>{sets.map((s) => {
                const why = refusalFor(s, linked[0] && sf.users.find((u) => u.id === linked[0].sfUserId), []);
                return (
                  <tr key={s.id} data-testid={`perm-${s.id}`}>
                    <td>{visible(s.label)}</td>
                    <td>{s.needsPsl ? <Chip state="warn" wrap>needs permission set license: {visible(s.needsPsl)}</Chip> : s.userLicense ? <Chip state="info" wrap>user licence {visible(s.userLicense)}</Chip> : <Chip state="ok">no licence needed</Chip>}</td>
                    <td data-testid={`perm-say-${s.id}`}>{why ? <Chip state="bad" wrap testId={`perm-refusal-${s.id}`}>{visible(why)}</Chip> : <span className="muted">can be granted</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
          <p className="muted">"Already has this permission set" appears when the user already holds the set. The refusal texts are what the guide recorded.</p>
        </Card>
      </div>

      <Card kicker="Active Policies" title={`Active Policies (${live.length})`} testId="policies">
        {live.length === 0 ? <p className="muted" data-testid="no-policies">Active Policies (0). Nothing is granted right now.</p> : (
          <div className="scroll"><table className="tbl tbl--wide">
            <thead><tr><th>Policy</th><th>User</th><th>Permission set</th><th>Until</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{live.map((p) => {
              const [state2, text] = POLICY_CHIP[p.status];
              return (
                <tr key={p.id} data-testid={`policy-${p.id}`}>
                  <td><code>{p.id}</code></td><td>{visible(p.userName)}</td><td>{visible(p.setLabel)}</td>
                  <td>{t(p.endAtIso)} UTC</td>
                  <td><Chip state={state2} testId={`policy-status-${p.id}`}>{text}</Chip></td>
                  <td><button type="button" className="danger-text" disabled={busy || p.status !== "active"} onClick={() => act("policy.delete", { policyId: p.id })} data-testid={`delete-${p.id}`}>Delete policy</button></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        <p className="muted" data-testid="queued-note">In the guide the removal is queued and a refresh shows it: press Refresh receipts.</p>
        <p className="muted">Delete is the three-dot menu on a policy: it removes only that policy and its grant. The red Delete on the app, which removes the whole Salesforce connection, is not modelled.</p>
        {ended.length > 0 && <p className="muted" data-testid="ended-count">Expired / Revoked: {ended.length} ({ended.map((p) => `${p.id} removed`).join(", ")})</p>}
      </Card>

      <Card kicker="Access Receipts" title={`Receipts (${pv.receipts.length})`} testId="receipts">
        {pv.receipts.length === 0 ? <p className="muted" data-testid="no-receipts">No receipts yet.</p> : (
          <div className="scroll"><table className="tbl tbl--wide">
            <thead><tr><th>Receipt</th><th>User</th><th>Permission set</th><th>Until</th><th>Status</th></tr></thead>
            <tbody>{pv.receipts.map((r) => (
              <tr key={r.id} data-testid={`receipt-${r.id}`}>
                <td><code>{r.id}</code></td><td>{visible(r.userName)}</td><td>{visible(r.setLabel)}</td><td>{t(r.endAtIso)} UTC</td>
                <td><Chip state={RECEIPT_STATE[r.status] || "warn"} testId={`receipt-status-${r.id}`}>{r.status}</Chip></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      <Card kicker="Reconciliation" title="What Privilege believes after a refresh" testId="reconcile-card">
        {!rec ? <p className="muted" data-testid="no-reconcile">Not reconciled yet. Refresh receipts compares the policies with the assignments Salesforce reports.</p> : (
          <>
            <CardGrid stats>
              {COUNTS.map(([k, label]) => (
                <div key={k} className="card card--neutral stat" data-testid={`count-${k}`}><span className="kicker">{label}</span><span className="stat__n">{rec.counts[k]}</span></div>
              ))}
            </CardGrid>
            <p className="muted" data-testid="rec-line">Reconciled {t(rec.atIso)} UTC: {rec.counts.confirmed} confirmed. Policies: {rec.policies.active} active, {rec.policies.expiredRevoked} Expired / Revoked.</p>
          </>
        )}
      </Card>

      <Card kicker="In Salesforce" title={`Permission Set Assignments (${sf.assignments.length})`} testId="assignments">
        {sf.assignments.length === 0 ? <p className="muted" data-testid="no-assignments">No assignments in the org.</p> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>User</th><th>Permission set</th><th>Assigned by</th></tr></thead>
            <tbody>{sf.assignments.map((a) => <tr key={a.id}><td>{visible(userName(a.userId))}</td><td>{visible(setLabel(a.setId))}</td><td>{a.source === "privilege" ? <Chip state="ok">Privilege policy</Chip> : <Chip state="warn">by hand</Chip>}</td></tr>)}</tbody>
          </table></div>
        )}
      </Card>

      <LastAction last={last} />
      {open && app && <GrantDialog lab={lab} app={app} linked={linked} sets={sets} assignments={sf.assignments} sfUsers={sf.users} onClose={() => setOpen(false)} />}
    </div>
  );
}
