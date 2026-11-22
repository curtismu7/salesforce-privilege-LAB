import Basis from "./Basis.jsx";
import { visible } from "../safeText";

// Lab-invented statements: the text comes from the server's labInvented list (by id), each with its lab-invented chip. Nothing is worded here.
export default function LabInvented({ ids, items, testId = "lab-invented-note" }) {
  const found = (ids || []).map((id) => (items || []).find((x) => x.id === id)).filter(Boolean);
  // No early return: an empty list is simply hidden (a component with a conditional return multiplies the static UI checker's states per use).
  return (
    <ul className="plain labinv" hidden={found.length === 0} data-testid={testId}>
      {found.map((x) => <li key={x.id} data-testid={`labinv-${x.id}`}><Basis basis="lab-invented" label={x.label} /> {visible(x.text)}</li>)}
    </ul>
  );
}

