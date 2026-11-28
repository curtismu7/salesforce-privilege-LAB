import { useCallback, useEffect, useRef, useState } from "react";
import { getInfo, getState, getStory, postAction, postRealRead, postReset, postScenario, setMode } from "../api";

const say = (r, what) => r.body?.message || `${what} failed (HTTP ${r.status})`;

/**
 * The lab's one data hook. It holds the info (source, realAvailable), the story for the picked vertical, the page state (the mock world's snapshot, or the
 * last Real read) and the last action. `act` is the only write: POST /api/actions. `switchMode` is the rule 19 toggle: POST /api/mode with exactly
 * { source }, then every piece of data is loaded again. `epoch` goes up on a switch, a Reset or a new vertical so a page can start over.
 */
export default function useLab() {
  const [vertical, setVerticalState] = useState("airlines");
  const [info, setInfo] = useState(null);
  const [story, setStory] = useState(null);
  const [page, setPage] = useState(null); // { source, state } (mock) or { source, real, host } (real)
  const [error, setError] = useState(null);
  const [modeError, setModeError] = useState(null);
  const [last, setLast] = useState(null); // { op, params, response } of the latest action
  const [busy, setBusy] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const seq = useRef(0);

  const load = useCallback(async (v = vertical) => {
    const mine = ++seq.current; // a late answer for a vertical or a mode the visitor has left is dropped
    const [i, s, p] = await Promise.all([getInfo(), getStory(v), getState(v)]);
    if (mine !== seq.current) return;
    const bad = [i, s, p].find((r) => !r.ok);
    if (bad) { setError(say(bad, "Loading the lab")); return; }
    setError(null); setInfo(i.body); setStory(s.body); setPage(p.body);
  }, [vertical]);

  useEffect(() => { load(vertical); }, [vertical]); // eslint-disable-line react-hooks/exhaustive-deps

  const setVertical = useCallback((v) => { setVerticalState(v); setLast(null); setEpoch((n) => n + 1); }, []);

  // Rule 19: the server decides. A 409 (Real not configured) is shown as the server worded it; nothing else changes.
  const switchMode = useCallback(async (source) => {
    const r = await setMode(source);
    if (!r.ok) { setModeError(r.body?.message || `The mode did not change (HTTP ${r.status})`); return { ok: false, message: r.body?.message }; }
    setModeError(null); setLast(null); setEpoch((n) => n + 1);
    await load(vertical);
    return { ok: true };
  }, [load, vertical]);

  const take = (body) => { if (body?.state) setPage({ source: "mock", workspace: body.workspace, vertical: body.vertical, state: body.state }); };

  const act = useCallback(async (op, params) => {
    setBusy(true);
    try {
      const r = await postAction(op, params, vertical);
      const response = r.body;
      // A refusal as data has ok:false and a code; a transport or mode failure has an error and a message.
      const result = r.ok && response.ok === true ? { ok: true, result: response.result } : { ok: false, status: r.status, code: response.error || "error", message: response.message || `HTTP ${r.status}`, outcome: response.outcome || null };
      take(response);
      setLast({ op, params: params || {}, result, response });
      return result;
    } finally { setBusy(false); }
  }, [vertical]);

  const runScenario = useCallback(async (id, upTo) => {
    setBusy(true);
    try {
      const r = await postScenario(id, vertical, upTo);
      if (r.ok) take(r.body);
      return r.ok ? { ok: true, run: r.body } : { ok: false, message: say(r, "The scenario"), code: r.body?.error };
    } finally { setBusy(false); }
  }, [vertical]);

  const readReal = useCallback(async (confirm) => {
    setBusy(true);
    try {
      const r = await postRealRead(confirm);
      if (r.ok) setPage((p) => ({ ...(p || {}), source: "real", real: r.body.real }));
      return r.ok ? { ok: true, real: r.body.real } : { ok: false, code: r.body?.error, message: say(r, "The read"), extra: r.body };
    } finally { setBusy(false); }
  }, []);

  const reset = useCallback(async () => {
    const r = await postReset();
    setLast(null); setEpoch((n) => n + 1);
    await load(vertical);
    return r.ok;
  }, [load, vertical]);

  const source = info?.source || null;
  const state = page?.source === "mock" ? page.state : null;
  return { vertical, setVertical, info, story, page, source, state, real: page?.source === "real" ? page.real : null, error, modeError, last, busy, epoch, reload: () => load(vertical), switchMode, act, runScenario, readReal, reset };
}
