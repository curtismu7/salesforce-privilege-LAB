import { useEffect, useState } from "react";
import { visible } from "../safeText";
import { t } from "../fmt";
import { Basis, Card, Chip, ClaimTag, HOT, Json, LabClock, LastAction, Loading, Outcome, ReadOnlyNotice, serverProblem } from "../components/Bits.jsx";

const SCOPE_TEXT = { api: "api", refresh_token: "refresh_token, offline_access", web: "web", full: "full", id: "id" };

function Checklist({ items }) {
  const done = items.filter((i) => i.done).length;
  return (
    <Card kicker="The checklist" title={`Connect: ${done} of ${items.length} steps`} testId="checklist">
      <ol className="plain checklist">
        {items.map((i, n) => (
          <li key={i.id} data-testid={`check-${i.id}`} data-done={i.done ? "true" : "false"}>
            <Chip state={i.done ? "ok" : "warn"}>{i.done ? "done" : "to do"}</Chip> {n + 1}. {visible(i.label)}
          </li>
        ))}
      </ol>
      <p className="muted">Privilege signs in as one integration user with a signed JWT. It works only when all of these are true. Miss one and Salesforce answers with the same generic error. <ClaimTag /></p>
    </Card>
  );
}

function SignInResult({ last, signedIn }) {
  const r = last && last.op === "wizard.signIn" ? last : null;
  return (
    <div data-testid="signin-result" aria-live="polite">
      {signedIn && <p className="lesson" data-testid="signed-in-line"><Chip state="ok">Signed in</Chip> {visible(signedIn.message)}</p>}
      {r && !r.result.ok && (
        <div className="panel" data-state="bad" data-testid="signin-refused">
          <h3 className="panel__sub">Check sign-in: {serverProblem(r.result) ? <Chip state="bad">server problem (HTTP {r.result.status || "no answer"})</Chip> : <Chip state="bad">refused: {r.result.code}</Chip>}</h3>
          <p className="field-error" role="alert" data-testid="signin-message">{visible(r.result.message)}</p>
          {r.result.outcome && <Outcome outcome={r.result.outcome} />}
        </div>
      )}
      {r && r.result.ok && (
        <div className="panel" data-state="ok" data-testid="signin-ok">
          <h3 className="panel__sub">Check sign-in: <Chip state="ok">signed in</Chip></h3>
          <p>{visible(r.result.result.message)}</p>
          {r.result.result.outcome && <Outcome outcome={r.result.result.outcome} />}
          <Json value={r.result.result.token} label="mock access token" hot={HOT} />
        </div>
      )}
    </div>
  );
}

export default function ConnectPage({ lab }) {
  const { state, story, act, busy, source, last } = lab;
  const [orgUrl, setOrgUrl] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [username, setUsername] = useState("");
  const [appName, setAppName] = useState("");
  const [eccName, setEccName] = useState("");
  const [code, setCode] = useState("");
  const [setLabel, setSetLabel] = useState("");
  const [assignTo, setAssignTo] = useState("sfu-1");
  const [assignSet, setAssignSet] = useState("");
  const host = state?.salesforce.host;
  useEffect(() => { if (host && !orgUrl) setOrgUrl(`https://${host}/lightning/page/home`); }, [host]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (story?.cast?.castEccName && !eccName) setEccName(story.cast.castEccName); }, [story]); // eslint-disable-line react-hooks/exhaustive-deps
  if (source === "real") return <ReadOnlyNotice host={lab.info?.realHost} />;
  if (!state || !story) return <Loading />;

  const { salesforce: sf, privilege: pv } = state;
  const eca = sf.externalClientApp;
  const w = pv.wizard;
  const off = busy;
  const sets = sf.permissionSets;
  const cert = eca?.certificate;
  const reveal = eca?.consumerKey;

  return (
    <div className="stack">
      <div className="cols">
        <Checklist items={state.checklist} />
        <LabClock clock={state.clock} act={act} busy={busy} />
      </div>

      <div className="cols">
        <Card kicker="Privilege: Add Application wizard" title="Rehearse the wizard" testId="wizard">
          <h3 className="panel__sub"><span className="step-num" aria-hidden="true">1</span>Org URL</h3>
          <label>Any address from the signed-in org
            <input value={orgUrl} onChange={(e) => setOrgUrl(e.target.value)} aria-label="Org URL" data-testid="org-url" spellCheck="false" />
          </label>
          <div className="seg"><button type="button" disabled={off || !orgUrl.trim()} onClick={() => act("wizard.orgUrl", { url: orgUrl })} data-testid="convert-org">Convert to My Domain URL</button></div>
          {w.instanceUrl && <p className="lesson" data-testid="instance-url">My Domain URL: <code>{visible(w.instanceUrl)}</code></p>}

          <h3 className="panel__sub"><span className="step-num" aria-hidden="true">2</span>Key and certificate</h3>
          <div className="seg">
            {!w.currentKey
              ? <button type="button" disabled={off || !w.orgUrl} onClick={() => act("wizard.generateKey")} data-testid="generate-key">Generate key and certificate</button>
              : <button type="button" disabled={off} onClick={() => act("wizard.regenerateKey")} data-testid="regenerate-key">Regenerate (a new key; the app's certificate then stops matching)</button>}
          </div>
          {w.certs.length === 0 ? <p className="muted" data-testid="no-certs">No key yet. The private key lives only in this form and is never shown.</p> : (
            <div className="scroll"><table className="tbl">
              <caption>Certificates the wizard produced (valid two years)</caption>
              <thead><tr><th>File</th><th>Id</th><th>Valid until</th><th>Key</th></tr></thead>
              <tbody>{w.certs.map((c) => (
                <tr key={c.id} data-testid={`cert-${c.id}`}><td>{visible(c.file)}</td><td><code>{c.id}</code></td><td>{t(c.notAfterAt)} UTC</td><td>{c.keyId === w.currentKey ? <Chip state="ok">current</Chip> : <Chip state="warn">old</Chip>}</td></tr>
              ))}</tbody>
            </table></div>
          )}

          <h3 className="panel__sub"><span className="step-num" aria-hidden="true">3</span>Consumer Key and Authorized User</h3>
          <label>Consumer Key
            <input value={consumerKey} onChange={(e) => setConsumerKey(e.target.value)} aria-label="Consumer Key" data-testid="consumer-key" spellCheck="false" autoComplete="off" />
          </label>
          <label>Authorized User (the Username, not the email)
            <input value={username} onChange={(e) => setUsername(e.target.value)} aria-label="Authorized User" data-testid="authorized-user" spellCheck="false" autoComplete="off" />
          </label>
          <div className="seg" role="group" aria-label="Fill the Authorized User">
            {sf.users.filter((u) => u.active).slice(0, 3).map((u) => (
              <span key={u.id} className="seg">
                <button type="button" onClick={() => setUsername(u.username)} data-testid={`fill-username-${u.id}`}>Username of {visible(u.name)}</button>
                <button type="button" onClick={() => setUsername(u.email)} data-testid={`fill-email-${u.id}`}>Email of {visible(u.name)} (wrong on purpose)</button>
              </span>
            ))}
          </div>
          <p className="muted" data-testid="check-note">Check sign-in is this lab's own button. In Privilege itself the check runs automatically as soon as the three values are filled.</p>
          <div className="seg">
            <button type="button" className="primary" disabled={off || !consumerKey.trim() || !username.trim()} onClick={() => act("wizard.signIn", { consumerKey, username })} data-testid="check-signin">Check sign-in</button>
          </div>
          <SignInResult last={last} signedIn={w.signedIn} />

          <h3 className="panel__sub"><span className="step-num" aria-hidden="true">4</span>Name the application and create it</h3>
          <label>Application name (at least 4 characters)
            <input value={appName} onChange={(e) => setAppName(e.target.value)} aria-label="Application name" data-testid="app-name" maxLength={80} />
          </label>
          <div className="seg">
            <button type="button" disabled={off || !w.signedIn || !!pv.app || appName.trim().length < 4} onClick={() => act("app.create", { name: appName })} data-testid="create-app">Create Application</button>
          </div>
          {pv.app && <p className="lesson" data-testid="app-line"><Chip state={pv.app.syncStatus === "Ready" ? "ok" : "bad"}>Sync Status {pv.app.syncStatus}</Chip> {visible(pv.app.name)} on <code>{visible(pv.app.host)}</code> as {visible(pv.app.authorizedUser)}</p>}
        </Card>

        <Card kicker="Salesforce: Setup" title="The External Client App" testId="eca">
          {!eca ? (
            <>
              <p className="muted" data-testid="no-eca">The org has no External Client App yet. Create one (Distribution State Local). It can take up to 10 minutes to activate.</p>
              <label>Name
                <input value={eccName} onChange={(e) => setEccName(e.target.value)} aria-label="External Client App name" data-testid="eca-name" maxLength={80} />
              </label>
              <div className="seg"><button type="button" disabled={off || !eccName.trim()} onClick={() => act("sf.createApp", { name: eccName })} data-testid="create-eca">New External Client App</button></div>
            </>
          ) : (
            <>
              <dl className="kv">
                <dt>Name</dt><dd data-testid="eca-title">{visible(eca.name)}</dd>
                <dt>Distribution</dt><dd>{eca.distribution}</dd>
                <dt>Activates</dt><dd data-testid="eca-active">{eca.active ? <Chip state="ok">active</Chip> : <Chip state="warn">not active yet</Chip>} from {t(eca.activeAt)} UTC (up to 10 minutes after {t(eca.createdAt)})</dd>
                <dt>Consumer Key</dt><dd data-testid="eca-key">{reveal ? <><code>{visible(reveal)}</code> <span className="muted">{visible(eca.consumerKeyNote)}</span></> : <span className="muted">{visible(eca.consumerKeyNote)}</span>}</dd>
              </dl>

              <fieldset className="fieldset"><legend>OAuth scopes</legend>
                {(story.scopes || []).map((s) => (
                  <label key={s} className="check"><input type="checkbox" checked={eca.scopes.includes(s)} disabled={off}
                    onChange={() => act("sf.setScopes", { scopes: eca.scopes.includes(s) ? eca.scopes.filter((x) => x !== s) : [...eca.scopes, s] })} data-testid={`scope-${s}`} />{SCOPE_TEXT[s] || s}</label>
                ))}
              </fieldset>

              <fieldset className="fieldset"><legend>Flow Enablement: JWT Bearer</legend>
                <label className="check"><input type="checkbox" checked={eca.jwtBearer} disabled={off} onChange={() => act("sf.setJwtBearer", { enabled: !eca.jwtBearer })} data-testid="jwt-bearer" />Enable JWT Bearer Flow</label>
                <label>Uploaded certificate
                  <select value={cert?.id || ""} disabled={off} onChange={(e) => e.target.value && act("sf.setJwtBearer", { enabled: true, certId: e.target.value })} aria-label="Uploaded certificate" data-testid="cert-select">
                    <option value="">{cert ? "" : "No certificate uploaded"}</option>
                    {cert && !w.certs.some((c) => c.id === cert.id) && <option value={cert.id}>{cert.id}: {visible(cert.commonName)} (not from the wizard)</option>}
                    {w.certs.map((c) => <option key={c.id} value={c.id}>{c.id}: {visible(c.file)}{c.keyId === w.currentKey ? " (current key)" : " (old key)"}</option>)}
                    <option value="cert-stranger">A certificate from some other key</option>
                  </select>
                </label>
                {cert && <p className="muted" data-testid="cert-line">{visible(cert.commonName)}, expires {t(cert.notAfterAt)} UTC {cert.expired ? <Chip state="bad">expired</Chip> : <Chip state="ok">valid</Chip>}</p>}
              </fieldset>

              <fieldset className="fieldset"><legend>Policies: Permitted Users</legend>
                {[["self_authorize", "All users can self-authorize"], ["admin_preauthorized", "Admin approved users are pre-authorized"]].map(([v, l]) => (
                  <label key={v} className="check"><input type="radio" name="permitted" checked={eca.permittedUsers === v} disabled={off} onChange={() => act("sf.setPermittedUsers", { policy: v })} data-testid={`permitted-${v}`} />{l}</label>
                ))}
              </fieldset>

              <fieldset className="fieldset"><legend>Permission sets: link to the app, assign to the signing-in user</legend>
                <div className="scroll"><table className="tbl">
                  <thead><tr><th>Permission set</th><th>Linked to the app</th><th>Action</th></tr></thead>
                  <tbody>{sets.map((s) => (
                    <tr key={s.id} data-testid={`set-${s.id}`}>
                      <td>{visible(s.label)}</td>
                      <td>{s.linked ? <Chip state="ok">linked</Chip> : <Chip state="none">not linked</Chip>}</td>
                      <td><button type="button" disabled={off || s.linked} onClick={() => act("sf.linkPermissionSet", { permSetId: s.id })} data-testid={`link-${s.id}`}>Link to the app</button></td>
                    </tr>
                  ))}</tbody>
                </table></div>
                <div className="filters">
                  <label>Permission set
                    <select value={assignSet || eca.linkedSets[0] || ""} onChange={(e) => setAssignSet(e.target.value)} aria-label="Permission set to assign" data-testid="assign-set">
                      {sets.map((s) => <option key={s.id} value={s.id}>{visible(s.label)}</option>)}
                    </select>
                  </label>
                  <label>Assign to
                    <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} aria-label="User to assign to" data-testid="assign-user">
                      {sf.users.map((u) => <option key={u.id} value={u.id}>{visible(u.name)}</option>)}
                    </select>
                  </label>
                </div>
                <div className="seg"><button type="button" disabled={off || !(assignSet || eca.linkedSets[0])} onClick={() => act("sf.assignPermissionSet", { userId: assignTo, permSetId: assignSet || eca.linkedSets[0] })} data-testid="assign-btn">Assign</button></div>
                <label>Create an empty permission set (license None)
                  <input value={setLabel} onChange={(e) => setSetLabel(e.target.value)} aria-label="New permission set label" data-testid="new-set-label" maxLength={80} />
                </label>
                <div className="seg"><button type="button" disabled={off || !setLabel.trim()} onClick={() => act("sf.createPermissionSet", { label: setLabel }).then((r) => r.ok && setSetLabel(""))} data-testid="create-set">Create permission set</button></div>
              </fieldset>

              <fieldset className="fieldset"><legend>Settings, OAuth Settings: Consumer Key and Secret</legend>
                <p className="muted">Salesforce emails a verification code first. The mailbox below is a MOCK: nothing is sent. Copy only the Consumer Key; the Consumer Secret is not used.</p>
                <div className="seg">
                  <button type="button" disabled={off} onClick={() => act("sf.requestKeyCode")} data-testid="request-code">Email me a verification code</button>
                  <label className="inline">Code <input value={code} onChange={(e) => setCode(e.target.value)} aria-label="Verification code" data-testid="code" inputMode="numeric" maxLength={12} /></label>
                  <button type="button" disabled={off || !code.trim()} onClick={() => act("sf.revealConsumerKey", { code })} data-testid="reveal-key">Show Consumer Key</button>
                  {reveal && <button type="button" onClick={() => setConsumerKey(reveal)} data-testid="use-key">Use it in the wizard form</button>}
                </div>
                {sf.mailbox.length === 0 ? <p className="muted" data-testid="no-mail">The mock mailbox is empty.</p> : (
                  <ul className="plain" data-testid="mailbox">{sf.mailbox.map((m) => <li key={m.n}>{t(m.at)} to {visible(m.to)}: {visible(m.subject)}. Code <code>{visible(m.code)}</code></li>)}</ul>
                )}
              </fieldset>
            </>
          )}
        </Card>
      </div>

      <LastAction last={last} quietFor="wizard.signIn" labInvented={story.labInvented} />

      {story.signInOrder && (
        <Card kicker="Check order" title="The order Check sign-in tests things in is the lab's own choice" testId="sign-in-order">
          <p className="muted" data-testid="sign-in-order-note">{visible(story.signInOrder.note)} <Basis basis="lab-inferred" label={story.labels?.["lab-inferred"]} /></p>
          <ol className="plain">{story.signInOrder.checks.map((c) => <li key={c}><code>{visible(c)}</code></li>)}</ol>
        </Card>
      )}

      <Card kicker="Troubleshooting" title="Symptom, cause, fix">
        <details>
          <summary>The guide's table ({(story.troubleshooting || []).length} symptoms), each marked observed or lab-inferred</summary>
          <div className="scroll"><table className="tbl tbl--wide" data-testid="troubleshooting">
            <thead><tr><th>Symptom</th><th>Cause</th><th>Fix</th><th>Basis</th></tr></thead>
            <tbody>{(story.troubleshooting || []).map((r) => <tr key={r.symptom}><td>{visible(r.symptom)}</td><td>{visible(r.cause)}</td><td>{visible(r.fix)}</td><td><Basis basis={r.basis} label={r.label} /></td></tr>)}</tbody>
          </table></div>
        </details>
      </Card>
    </div>
  );
}
