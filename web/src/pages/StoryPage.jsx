import { useRef, useState } from "react";
import { visible } from "../safeText";
import { Basis, LabInvented, labInventedIds, Card, CardGrid, Chip, ClaimTag, HOT, Json, Loading, Outcome } from "../components/Bits.jsx";

const expectText = (e) => (e === "ok" ? "Expected: it succeeds" : `Expected: it is refused with ${e}`);

function Step({ step, items }) {
  const refused = !step.result.ok;
  return (
    <li className="run__step" data-testid={`run-step-${step.index}`} data-met={step.met ? "true" : "false"}>
      <p className="run__say"><span className="step-num" aria-hidden="true">{step.index}</span>{visible(step.say)}</p>
      <p className="run__line">
        <code>{step.op}</code>{" "}
        <Chip state="info" testId={`expect-${step.index}`}>{expectText(step.expect)}</Chip>{" "}
        {step.met ? <Chip state="ok" testId={`met-${step.index}`}>As expected</Chip> : <Chip state="bad" testId={`met-${step.index}`}>Not as expected</Chip>}
      </p>
      <LabInvented ids={labInventedIds(step.op, step.result)} items={items} testId={`step-labinv-${step.index}`} />
      {refused && <p className="field-error" role="note" data-testid={`refusal-${step.index}`}>{step.result.code}: {visible(step.result.message)}</p>}
      {refused && step.result.outcome && <Outcome outcome={step.result.outcome} />}
      <Json value={{ op: step.op, params: step.params }} label={`step ${step.index} request`} hot={HOT} />
      <Json value={step.result} label={`step ${step.index} response`} hot={HOT} />
      {step.calls.length > 0 && (
        <details>
          <summary>What the mock Privilege app sent to Salesforce ({step.calls.length})</summary>
          {step.calls.map((c, i) => (
            <div key={i}>
              <h3 className="hops__title">{c.method} {visible(`https://${c.host}${c.path}`)} (HTTP {c.status})</h3>
              {c.request != null && <Json value={c.request} label={`step ${step.index} call ${i + 1} request`} hot={HOT} />}
              {c.response != null && <Json value={c.response} label={`step ${step.index} call ${i + 1} response`} hot={HOT} />}
            </div>
          ))}
        </details>
      )}
    </li>
  );
}

export default function StoryPage({ lab }) {
  const { story, source } = lab;
  const [picked, setPicked] = useState(null);
  const [run, setRun] = useState(null); // { id, steps, ok, setupFailures }
  const [error, setError] = useState(null);
  const panelRef = useRef(null);
  if (!story) return <Loading />;
  const real = source === "real";
  const scenarios = story.scenarios || [];
  const sc = scenarios.find((s) => s.id === picked) || null;
  const shown = run && sc && run.id === sc.id ? run : null;
  const done = shown ? shown.steps.length : 0;
  const finished = sc && done >= sc.steps;

  const go = async (upTo) => {
    setError(null);
    const r = await lab.runScenario(sc.id, upTo);
    if (!r.ok) { setError(r.message); return; }
    setRun({ id: sc.id, steps: r.run.steps, ok: r.run.ok, setupFailures: r.run.setupFailures });
  };
  const pick = (id) => { setPicked(id); setRun(null); setError(null); setTimeout(() => panelRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }), 0); };

  return (
    <div className="stack">
      <Card kicker="Story" title="The scripted scenarios">
        <p className="muted">{scenarios.length} scenarios, each run by the lab's own engine against a mock Salesforce org. Pick one, press Run, and walk it a step at a time: every step says what was expected and what happened, with the raw request and response. <ClaimTag label={story.observedLabel} /></p>
        <div className="seg" role="group" aria-label="Vertical pack">
          {(story.verticals || []).map((v) => <button key={v} type="button" aria-pressed={lab.vertical === v} onClick={() => lab.setVertical(v)} data-testid={`pack-${v}`}>{v}</button>)}
        </div>
        <p className="muted">The vertical pack changes only the cast (names, org, permission sets). The mechanics are the same in all three.</p>
      </Card>

      {real && <p className="field-error" role="note" data-testid="story-real">Real only reads, so a scenario cannot run. Switch to Mock in the header to run one.</p>}

      {sc && (
        <div ref={panelRef}><Card kicker="Scenario" title={visible(sc.title)} testId="scenario-panel">
          <p className="lesson">{visible(sc.say)}</p>
          <p className="muted">Starts from: {visible(sc.presetText)}. {sc.steps} steps. {sc.basis && <Basis basis={sc.basis} label={sc.label} testId="scenario-panel-basis" />} A step that shows something lab-invented says so under it.</p>
          <div className="seg">
            {!shown && <button type="button" className="primary" disabled={real || lab.busy} onClick={() => go(1)} data-testid="run">Run</button>}
            {shown && <button type="button" disabled={real || lab.busy || finished} onClick={() => go(done + 1)} data-testid="next-step">Next step</button>}
            <button type="button" disabled={real || lab.busy || finished} onClick={() => go()} data-testid="run-all">Run all steps</button>
            <button type="button" disabled={lab.busy} onClick={() => lab.reset().then(() => setRun(null))} data-testid="story-reset">Reset</button>
          </div>
          {error && <p className="field-error" role="alert" data-testid="run-error">{visible(error)}</p>}
          {!shown && !error && <p className="muted">Run starts the scenario and shows step 1. The page's state (Connect, Link, Grant) follows the scenario to the step you reach.</p>}
          {shown && (
            <>
              <p className="run__summary" role="status" data-testid="run-summary">
                Step {done} of {sc.steps}.{" "}
                {shown.steps.every((x) => x.met) ? <Chip state="ok">every step so far as expected</Chip> : <Chip state="bad">a step did not go as expected</Chip>}
                {finished && <> <Chip state="info">finished</Chip></>}
              </p>
              {shown.setupFailures?.length > 0 && <p className="field-error" role="alert">Setup steps that failed: {visible(shown.setupFailures.join(", "))}</p>}
              <ol className="run" data-testid="run-steps">{shown.steps.map((st) => <Step key={st.index} step={st} items={story.labInvented} />)}</ol>
              <p className="muted">Look at the result on <a href="#connect">Connect</a>, <a href="#link">Link</a> and <a href="#grant">Grant and revoke</a>.</p>
            </>
          )}
        </Card></div>
      )}

      {scenarios.length === 0 ? <p className="muted" data-testid="no-scenarios">No scenarios came back from the server.</p> : (
        <CardGrid>
          {scenarios.map((s, i) => (
            <button key={s.id} type="button" className="card card--pick" aria-pressed={picked === s.id} onClick={() => pick(s.id)} data-testid={`scenario-${s.id}`}>
              <span className="kicker">Scenario {i + 1} of {scenarios.length}</span>
              <span className="card__title">{visible(s.title)}</span>
              <span className="muted">{s.steps} steps, starting from {visible(s.presetText)}</span>
              {s.basis && <Basis basis={s.basis} label={s.label} testId={`scenario-basis-${s.id}`} />}
            </button>
          ))}
        </CardGrid>
      )}

      <Card kicker="Honesty" title="What is simulated, what is observed, and what is lab-invented" testId="honesty">
        <p className="muted">Three labels, shown wherever a statement appears: <Basis basis="observed" /> the one real setup recorded it; <Basis basis="lab-inferred" /> the guide gives the advice or the symptom, not this exact failure; <Basis basis="lab-invented" /> not observed anywhere, only here so the demo has something to show. All of it is UNVERIFIED as a product claim.</p>
        <details open>
          <summary>Lab-invented ({(story.labInvented || []).length})</summary>
          <ul className="plain" data-testid="lab-invented">{(story.labInvented || []).map((x) => <li key={x.id}><Basis basis={x.basis} label={x.label} /> {visible(x.text)}</li>)}</ul>
        </details>
        <details>
          <summary>Not demonstrated ({(story.notDemonstrated || []).length})</summary>
          <ul className="plain" data-testid="not-demonstrated">{(story.notDemonstrated || []).map((n) => <li key={n}>{visible(n)}</li>)}</ul>
        </details>
        <details>
          <summary>Claims ({(story.claims || []).length})</summary>
          <ul className="plain" data-testid="claims">{(story.claims || []).map((c) => <li key={c.id}><Basis basis={c.basis} label={c.label} /> {visible(c.claim)}</li>)}</ul>
        </details>
        <p className="muted">{visible(story.limitsText)}</p>
      </Card>
    </div>
  );
}
