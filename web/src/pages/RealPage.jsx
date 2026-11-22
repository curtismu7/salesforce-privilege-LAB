import { useState } from "react";
import { visible } from "../safeText";
import { t } from "../fmt";
import { Card, Chip, HOT, Json, Loading } from "../components/Bits.jsx";

const WOULD_DO = [
  "One sign-in to the one Salesforce origin named in this lab's own .env: a signed JWT (RS256) in the JWT bearer flow. Nothing else is contacted.",
  "Two read-only queries: the org's permission sets and its standard users.",
  "Nothing is granted, assigned, changed or deleted, and the lab does not follow a redirect.",
  "The private key is write-only: read from its file for the one signature, never shown, logged or cached. The access token is used for the two reads and dropped.",
  "Owner-run only. Agents never run Real, and Docker never starts in Real.",
];

export default function RealPage({ lab }) {
  const { info, source, story, real, modeError } = lab;
  const [confirm, setConfirm] = useState("");
  const [result, setResult] = useState(null);
  if (!info || !story) return <Loading />;
  const available = info.realAvailable;
  const isReal = source === "real";
  const read = async () => { setResult(null); const r = await lab.readReal(confirm); setResult(r); };
  const sets = real?.permissionSets || [];
  const users = real?.users || [];

  return (
    <div className="stack">
      <Card kicker="Real" title="What Real would do" testId="real-would">
        <ul className="plain" data-testid="real-list">{WOULD_DO.map((w) => <li key={w}>{w}</li>)}</ul>
        <p className="muted">Real exists so the owner can compare the mock with one real org. What it reads is your own org's data, nothing more.</p>
      </Card>

      <Card kicker="Source" title="Mock or Real" testId="real-source">
        <p data-testid="source-line">The page is in <Chip state={isReal ? "warn" : "info"}>{isReal ? "Real (read-only)" : "Mock"}</Chip> mode. Real is {available ? <Chip state="ok">configured</Chip> : <Chip state="none">not configured</Chip>}{available && info.realHost ? <> for <code>{visible(info.realHost)}</code></> : null}.</p>
        <p className="muted">Use the Mock / Real toggle in the header on any page to switch; it contacts nothing. Only the confirmed read below does.</p>
        {!available && <p className="field-error" data-testid="real-howto" role="note">{visible((info.realReason || "Real is not configured").replace(/\.$/, ""))}. Mock keeps working. To make Real ready, run <code>scripts/setup-real.sh</code> once in your own terminal: it makes the key and certificate, prints the External Client App steps, asks for the Consumer Key and Username with hidden input and writes the lab's <code>.env</code>. Then restart the lab. Nothing secret is returned or logged.</p>}
        {modeError && <p className="field-error" role="alert" data-testid="mode-error">{visible(modeError)}</p>}
      </Card>

      <Card kicker="Read" title="The one read, behind a confirm gate" testId="real-read">
        {!isReal ? (
          <p className="muted" data-testid="real-not-selected">{available ? "Switch to Real with the toggle in the header (this contacts nothing) and then the read becomes available. The read itself is one confirmed call." : "The read is unavailable until Real is configured."}</p>
        ) : (
          <>
            <p className="muted">The read contacts the configured org once. To confirm, type its host{info.realHost ? <> (<code>{visible(info.realHost)}</code>)</> : null}.</p>
            <label>Org host
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Confirm the org host" data-testid="confirm-host" spellCheck="false" autoComplete="off" maxLength={200} />
            </label>
            <div className="seg"><button type="button" className="primary" disabled={lab.busy || !confirm.trim()} onClick={read} data-testid="real-read-btn">Read the org (one sign-in, read-only)</button></div>
            {result && !result.ok && (
              <div className="field-error" role="alert" data-testid="real-error">
                {result.code && <code>{result.code}</code>} {visible(result.message)}
                {result.extra?.salesforce && <Json value={result.extra.salesforce} label="what Salesforce answered" hot={HOT} />}
              </div>
            )}
          </>
        )}
        {isReal && !real && !result && <p className="muted" data-testid="real-empty">Nothing has been read yet in this workspace.</p>}
        {real && (
          <div data-testid="real-result">
            <p className="lesson" data-testid="real-read-note"><Chip state="ok">read-only</Chip> Read {t(real.fetchedAt)} UTC from <code>{visible(real.host)}</code>: {sets.length} permission sets, {users.length} users.</p>
            <div className="cols">
              <div className="scroll"><table className="tbl">
                <caption>Permission sets ({sets.length})</caption>
                <thead><tr><th>Label</th><th>Name</th></tr></thead>
                <tbody>{sets.length === 0 ? <tr><td colSpan="2" className="muted">None came back.</td></tr> : sets.map((s) => <tr key={s.id}><td>{visible(s.label)}</td><td><code>{visible(s.name)}</code></td></tr>)}</tbody>
              </table></div>
              <div className="scroll"><table className="tbl">
                <caption>Users ({users.length})</caption>
                <thead><tr><th>Name</th><th>Username</th><th>Active</th></tr></thead>
                <tbody>{users.length === 0 ? <tr><td colSpan="3" className="muted">None came back.</td></tr> : users.map((u) => <tr key={u.id}><td>{visible(u.name)}</td><td>{visible(u.username)}</td><td>{u.active ? <Chip state="ok">active</Chip> : <Chip state="none">inactive</Chip>}</td></tr>)}</tbody>
              </table></div>
            </div>
            <Json value={real} label="the read, as returned" hot={HOT} />
          </div>
        )}
      </Card>
    </div>
  );
}
