import LabInvented from "./LabInvented.jsx";

// The presenter's lines for a page, then what on that page is lab-invented (never to be read out as observed).
export default function PresenterSay({ say, inventedIds, items }) {
  return (
    <aside className="presenter-say" data-testid="presenter-say" aria-label="Talk track" hidden={say.length === 0 && inventedIds.length === 0}>
      {say.map((t) => <p key={t.id}><strong>{t.title}.</strong> {t.say}</p>)}
      <LabInvented ids={inventedIds} items={items} testId="presenter-labinv" />
    </aside>
  );
}
