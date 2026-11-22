import { useState } from "react";
import { visible } from "../safeText";
import { Card, Chip, LastAction, Loading, ReadOnlyNotice } from "../components/Bits.jsx";

function Seats({ licenses }) {
  const full = licenses.free <= 0;
  return (
    <div data-testid="seats">
      <p className="lesson"><strong data-testid="seats-text">{licenses.used} of {licenses.total} Salesforce user seats used, {licenses.free} free.</strong>{" "}
        {full ? <Chip state="bad">no seats left: a new Salesforce-licensed user is refused</Chip> : <Chip state="ok">{licenses.free} free</Chip>}</p>
      <div className="seats" role="img" aria-label={`${licenses.used} of ${licenses.total} seats used`}>
        {Array.from({ length: licenses.total }, (_, i) => <span key={i} className="seat" data-used={i < licenses.used ? "true" : "false"} />)}
      </div>
    </div>
  );
}

export default function LinkPage({ lab }) {
  const { state, act, busy, source, last } = lab;
  const [fed, setFed] = useState({});
  const [nu, setNu] = useState({ name: "", email: "", username: "" });
  if (source === "real") return <ReadOnlyNotice host={lab.info?.realHost} />;
  if (!state) return <Loading />;
  const { salesforce: sf, privilege: pv } = state;
  const app = pv.app;
  const rows = new Map(pv.users.map((r) => [r.privilegeUserId, r]));
  const sfName = (id) => sf.users.find((u) => u.id === id)?.name;
  const canCreate = nu.name.trim() && nu.email.trim() && nu.username.trim();

  return (
    <div className="stack">
      <Card kicker="Link" title="Privilege matches a person on one thing: the exact email" testId="link-intro">
        <p>Sync reads the org's users and links a Privilege user to a Salesforce user only when the two emails are identical. When two Privilege records share an email, neither links. A Federation ID on the Salesforce user does not rescue a mismatch. Privilege never creates Salesforce users: someone without one waits until an admin adds them.</p>
        <div className="seg">
          <button type="button" className="primary" disabled={busy || !app} onClick={() => act("app.sync")} data-testid="sync">Sync</button>
          {!app && <span className="muted" data-testid="no-app">Create the application first: <a href="#connect">Connect</a> (sign in, then Create Application).</span>}
          {app && <span className="muted">Last sync: {pv.app.lastSyncAt ? `${pv.app.lastSyncAt.slice(0, 16).replace("T", " ")} UTC` : "never"}</span>}
        </div>
      </Card>

      <div className="cols">
        <Card kicker="PingOne Privilege" title="Privilege users" testId="privilege-users">
          <p className="muted">The directory was read-only in the one real run. Add Users puts a person on this application; the row waits until Sync finds their email in Salesforce.</p>
          <div className="scroll"><table className="tbl tbl--wide">
            <caption>Privilege users ({pv.directory.length})</caption>
            <thead><tr><th>Name</th><th>Email</th><th>On the application</th><th>Action</th></tr></thead>
            <tbody>{pv.directory.map((u) => {
              const row = rows.get(u.id);
              const refused = row?.reason?.startsWith("Not linked");
              return (
                <tr key={u.id} data-testid={`pu-${u.id}`} data-status={row ? row.status : "none"}>
                  <td>{visible(u.name)}{u.readOnly && <> <Chip state="none">read-only</Chip></>}</td>
                  <td className="email">{visible(u.email)}{u.sharedEmail && <> <Chip state="warn">shared email</Chip></>}</td>
                  <td>
                    {!row && <span className="muted">not added</span>}
                    {row?.status === "linked" && <><Chip state="ok">Linked</Chip> to {visible(sfName(row.sfUserId))}{row.profile ? ` (${visible(row.profile)})` : ""}</>}
                    {row && row.status !== "linked" && <><Chip state={refused ? "bad" : "warn"}>{refused ? "Not linked" : "Waiting for Salesforce"}</Chip><div className="muted" data-testid={`reason-${u.id}`}>{visible(row.reason)}</div></>}
                  </td>
                  <td><button type="button" disabled={busy || !app || !!row} onClick={() => act("users.add", { privilegeUserId: u.id })} data-testid={`add-${u.id}`}>Add Users</button></td>
                </tr>
              );
            })}</tbody>
          </table></div>
          {app && pv.users.length === 0 && <p className="muted" data-testid="no-rows">Users (0): nobody is on the application yet. Add Users.</p>}
        </Card>

        <Card kicker="Salesforce Developer org" title="Salesforce users" testId="salesforce-users">
          <Seats licenses={sf.licenses} />
          <div className="scroll"><table className="tbl tbl--xwide">
            <caption>Salesforce users ({sf.users.length})</caption>
            <thead><tr><th>Name and Username</th><th>Email</th><th>Federation ID</th><th>Status</th></tr></thead>
            <tbody>{sf.users.map((u) => (
              <tr key={u.id} data-testid={`sfu-${u.id}`}>
                <td>{visible(u.name)}<div className="muted mono">{visible(u.username)}</div><div className="muted">{visible(u.profile)}, licence {visible(u.license)}</div></td>
                <td className="email">{visible(u.email)}</td>
                <td>
                  {u.federationId
                    ? <><code>{visible(u.federationId)}</code> <Chip state="warn" wrap testId={`fed-chip-${u.id}`}>does not rescue a mismatch</Chip></>
                    : <span className="muted">not set</span>}
                  <div className="seg">
                    <input aria-label={`Federation ID for ${u.name}`} value={fed[u.id] || ""} onChange={(e) => setFed({ ...fed, [u.id]: e.target.value })} data-testid={`fed-input-${u.id}`} maxLength={120} />
                    <button type="button" disabled={busy || !(fed[u.id] || "").trim()} onClick={() => act("sf.setFederationId", { userId: u.id, federationId: fed[u.id] })} data-testid={`fed-set-${u.id}`}>Set</button>
                  </div>
                </td>
                <td>{u.active ? <Chip state="ok">active</Chip> : <Chip state="none">deactivated</Chip>}
                  {u.active && <div><button type="button" disabled={busy} onClick={() => act("sf.deactivateUser", { userId: u.id })} title="Deactivating frees a seat" data-testid={`deactivate-${u.id}`}>Deactivate</button></div>}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <p className="muted" data-testid="fed-note">A Federation ID is shown but it did not rescue an email mismatch in the one test run: a waiting row stays waiting, and the row's reason says so.</p>

          <h3 className="panel__sub">New Salesforce user</h3>
          <div className="filters">
            <label>Name<input value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} aria-label="New user name" data-testid="nu-name" maxLength={80} /></label>
            <label>Email<input value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} aria-label="New user email" data-testid="nu-email" maxLength={120} /></label>
            <label>Username (unique across all orgs)<input value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} aria-label="New user username" data-testid="nu-username" maxLength={120} /></label>
          </div>
          <div className="seg"><button type="button" disabled={busy || !canCreate} onClick={() => act("sf.createUser", nu).then((r) => r.ok && setNu({ name: "", email: "", username: "" }))} data-testid="create-user">Create user</button></div>
        </Card>
      </div>

      <LastAction last={last} />
    </div>
  );
}
