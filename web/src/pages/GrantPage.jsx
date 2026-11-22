import { useState } from "react";
import FloatingDialog from "../floating-dialog/FloatingDialog.jsx";
import { visible } from "../safeText";
import { t } from "../fmt";
import { Basis, Card, CardGrid, Chip, LabClock, LabInvented, LastAction, Loading, ReadOnlyNotice } from "../components/Bits.jsx";

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
const RECEIPT_STATE = { Granted: "ok", Expired: "none", Revoked: "none" };
const COUNTS = [["observed", "Observed"], ["confirmed", "Confirmed"], ["discovered", "Discovered"], ["orphaned", "Orphaned"], ["revokePending", "Revoke pending"]];

function GrantDialog({ lab, app, linked, sets, assignments, sfUsers, onClose }) {
  const { story, act, busy } = lab;
  const [user, setUser] = useState(linked[0]?.privilegeUserId || "");
  const [setId, setSetId] = useState(sets[0]?.id || "");
  // The shortest duration the server offers is the default, as the dialog's own text says (the default Privilege offered was about a year).
  const [dur, setDur] = useState(() => Math.min(...((story.durations || []).map((d) => d.min)), 525600));
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
        <label>Duration
          <select value={dur} onChange={(e) => setDur(e.target.value)} aria-label="Duration" data-testid="grant-duration">
            {(story.durations || []).map((d) => <option key={d.min} value={d.min}>{d.label}</option>)}
          </select>
        </label>
        <p className="muted">The default duration Privilege offered was about a year (observed), so pick the shortest to show expiry. The list of durations offered here is <Basis basis="lab-invented" label={story.labels?.["lab-invented"]} testId="durations-basis" />.</p>
        {hint && <p className="field-error" data-testid="grant-hint" role="note">Expect a refusal: {visible(hint)}</p>}
        {refusal && <p className="field-error" role="alert" data-testid="grant-refusal">{refusal.code}: {visible(refusal.message)}</p>}
        <div className="seg">
          <button type="button" className="primary" disabled={busy || !user || !setId} onClick={submit} data-testid="grant-submit">Grant</button>
        </div>
      </div>
    </FloatingDialog>
  );
}

export default function GrantPage({ lab }) {
  const { state, act, busy, source, last, story } = lab;
  const [open, setOpen] = useState(false);
  const [hand, setHand] = useState({ userId: "sfu-2", setId: "" });
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
  const handSet = hand.setId || sf.permissionSets[0]?.id || "";

  return (
    <div className="stack">
      <Card kicker="Grant and revoke" title="Zero standing privilege: a permission set for a window" testId="grant-intro">
        <p data-testid="intro-observed">Access is granted through a policy on the application and removed by deleting that policy: there is no Revoke button. <Basis basis="observed" label={story.labels?.observed} testId="intro-observed-basis" /></p>
        <p data-testid="intro-invented">The lab also ends a grant by itself when its window closes: a reaper removes the assignment. <Basis basis="lab-invented" label={story.labels?.["lab-invented"]} testId="intro-invented-basis" /> The guide observed only removal by deleting the policy.</p>
        <div className="seg">
          <button type="button" className="primary" disabled={busy || !app || linked.length === 0 || sets.length === 0} onClick={() => setOpen(true)} data-testid="open-grant">Grant Permission</button>
          <button type="button" disabled={busy || !app} onClick={() => act("app.sync")} data-testid="grant-sync">Sync</button>
          <button type="button" disabled={busy || !app} onClick={() => act("app.reconcile")} data-testid="reconcile">Reconcile</button>
          <button type="button" disabled={busy || !app} onClick={() => act("reaper.run")} title="The reaper is lab-invented" data-testid="reaper">Run the reaper (lab-invented)</button>
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
            <thead><tr><th>Policy</th><th>User</th><th>Permission set</th><th>Window</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{live.map((p) => {
              const [state2, text] = POLICY_CHIP[p.status];
              return (
                <tr key={p.id} data-testid={`policy-${p.id}`}>
                  <td><code>{p.id}</code></td><td>{visible(p.userName)}</td><td>{visible(p.setLabel)}</td>
                  <td>{t(p.startAtIso)} to {t(p.endAtIso)} UTC</td>
                  <td><Chip state={state2} testId={`policy-status-${p.id}`}>{text}</Chip>{p.lastError && <div className="field-error" role="note">Could not remove yet: {visible(p.lastError)}</div>}</td>
                  <td><button type="button" className="danger-text" disabled={busy || p.status !== "active"} onClick={() => act("policy.delete", { policyId: p.id })} data-testid={`delete-${p.id}`}>Delete policy</button></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        {live.some((p) => p.status === "revoke_pending") && <LabInvented ids={["reconcile-clears"]} items={story.labInvented} testId="pending-labinv" />}
        <p className="muted">Delete is the three-dot menu on a policy: it removes only that policy and its grant. The red Delete on the app, which removes the whole Salesforce connection, is not modelled.</p>
        {ended.length > 0 && <p className="muted" data-testid="ended-count">Expired / Revoked: {ended.length} ({ended.map((p) => `${p.id} ${p.cause === "expired" ? "expired" : "revoked"}`).join(", ")})</p>}
      </Card>

      <Card kicker="Access Receipts" title={`Receipts (${pv.receipts.length})`} testId="receipts">
        {pv.receipts.length === 0 ? <p className="muted" data-testid="no-receipts">No receipts yet.</p> : (
          <div className="scroll"><table className="tbl tbl--wide">
            <thead><tr><th>Receipt</th><th>User</th><th>Permission set</th><th>Ends</th><th>Status</th></tr></thead>
            <tbody>{pv.receipts.map((r) => (
              <tr key={r.id} data-testid={`receipt-${r.id}`}>
                <td><code>{r.id}</code> {r.kind === "drift" && <Chip state="info">drift</Chip>}</td><td>{visible(r.userName)}</td><td>{visible(r.setLabel)}</td><td>{t(r.endAtIso)} UTC</td>
                <td><Chip state={RECEIPT_STATE[r.status] || "warn"} testId={`receipt-status-${r.id}`}>{r.status}</Chip></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      <Card kicker="Reconciliation" title="What Privilege believes after a reconcile" testId="reconcile-card">
        {!rec ? <p className="muted" data-testid="no-reconcile">Not reconciled yet. Reconcile (or Sync) compares the policies with the assignments Salesforce reports.</p> : (
          <>
            <CardGrid stats>
              {COUNTS.map(([k, label]) => (
                <div key={k} className="card card--neutral stat" data-testid={`count-${k}`}><span className="kicker">{label}</span><span className="stat__n">{rec.counts[k]}</span></div>
              ))}
            </CardGrid>
            <p className="muted" data-testid="rec-line">Reconciled {t(rec.atIso)} UTC: {rec.counts.confirmed} confirmed. Policies: {rec.policies.active} active, {rec.policies.revokePending} revoke pending, {rec.policies.expiredRevoked} Expired / Revoked.</p>
            <LabInvented ids={["drift-names"]} items={story.labInvented} testId="drift-labinv" />
            {rec.findings.length > 0 && (
              <div className="scroll"><table className="tbl tbl--wide" data-testid="findings">
                <caption>Access outside any policy</caption>
                <thead><tr><th>Kind</th><th>User</th><th>Permission set</th><th>Action</th></tr></thead>
                <tbody>{rec.findings.map((f) => (
                  <tr key={`${f.privilegeUserId}-${f.setId}`} data-testid={`finding-${f.privilegeUserId}-${f.setId}`}>
                    <td><Chip state={f.kind === "orphaned" ? "bad" : "warn"}>{f.kind}</Chip></td><td>{visible(userName(f.sfUserId))}</td><td>{visible(f.setLabel)}</td>
                    <td><button type="button" className="danger-text" disabled={busy} onClick={() => act("drift.revoke", { privilegeUserId: f.privilegeUserId, permSetId: f.setId })} data-testid={`revoke-${f.privilegeUserId}-${f.setId}`}>Revoke</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </>
        )}
      </Card>

      <div className="cols">
        <Card kicker="In Salesforce" title={`Permission Set Assignments (${sf.assignments.length})`} testId="assignments">
          {sf.assignments.length === 0 ? <p className="muted" data-testid="no-assignments">No assignments in the org.</p> : (
            <div className="scroll"><table className="tbl">
              <thead><tr><th>User</th><th>Permission set</th><th>Assigned by</th></tr></thead>
              <tbody>{sf.assignments.map((a) => <tr key={a.id}><td>{visible(userName(a.userId))}</td><td>{visible(setLabel(a.setId))}</td><td>{a.source === "privilege" ? <Chip state="ok">Privilege policy</Chip> : <Chip state="warn">by hand</Chip>}</td></tr>)}</tbody>
            </table></div>
          )}
        </Card>
        <Card kicker="Drift" title="An admin assigns by hand" testId="hand-assign">
          <p className="muted">Assign a permission set directly in Salesforce, with no Privilege policy, then Reconcile: it shows up above as discovered or orphaned, and Revoke removes it.</p>
          <LabInvented ids={["drift-names"]} items={story.labInvented} testId="hand-labinv" />
          <div className="filters">
            <label>User<select value={hand.userId} onChange={(e) => setHand({ ...hand, userId: e.target.value })} aria-label="User to assign by hand" data-testid="hand-user">{sf.users.map((u) => <option key={u.id} value={u.id}>{visible(u.name)}</option>)}</select></label>
            <label>Permission set<select value={handSet} onChange={(e) => setHand({ ...hand, setId: e.target.value })} aria-label="Permission set to assign by hand" data-testid="hand-set">{sf.permissionSets.map((s) => <option key={s.id} value={s.id}>{visible(s.label)}</option>)}</select></label>
          </div>
          <div className="seg"><button type="button" disabled={busy || !handSet} onClick={() => act("sf.assignPermissionSet", { userId: hand.userId, permSetId: handSet })} data-testid="hand-go">Assign by hand in Salesforce</button></div>
        </Card>
      </div>

      <LastAction last={last} labInvented={story.labInvented} />
      {open && app && <GrantDialog lab={lab} app={app} linked={linked} sets={sets} assignments={sf.assignments} sfUsers={sf.users} onClose={() => setOpen(false)} />}
    </div>
  );
}
