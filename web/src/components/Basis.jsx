// The basis of a statement (server label states): observed in the one setup, lab-inferred from the guide's advice, or lab-invented. Never colour alone.
export const BASIS_STATE = { observed: "ok", "lab-inferred": "warn", "lab-invented": "bad" };
export default function Basis({ basis, label, testId }) {
  const b = basis || "observed";
  return <span className="tag" data-state={BASIS_STATE[b] || "warn"} title={label} data-testid={testId || "basis"}>{b}</span>;
}

