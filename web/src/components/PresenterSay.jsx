import { visible } from "../safeText";

// The presenter's lines for a page: the talk-track items for it, as the server worded them.
export default function PresenterSay({ say, heading }) {
  return (
    <aside className="presenter-say" data-testid="presenter-say" aria-label="Talk track" hidden={say.length === 0}>
      {heading && <p className="kicker" data-testid="presenter-beat">{heading}</p>}
      {say.map((t) => <p key={t.id}><strong>{visible(t.title)}.</strong> {visible(t.say)}</p>)}
    </aside>
  );
}
