import { useEffect, useState } from "react";
import TopMenu, { applyFontSize } from "./top-menu/TopMenu.jsx";
import TalkTrackDialog from "./talk-track/TalkTrackDialog.jsx";
import ModeToggle from "./components/ModeToggle.jsx";
import ShelfLink from "./components/ShelfLink.jsx";
import VerifyMark from "./components/VerifyMark.jsx";
import useLab from "./hooks/useLab";
import { workspaceId } from "./workspace.js";
import PresenterSay from "./components/PresenterSay.jsx";
import StoryPage from "./pages/StoryPage.jsx";
import ConnectPage from "./pages/ConnectPage.jsx";
import LinkPage from "./pages/LinkPage.jsx";
import GrantPage from "./pages/GrantPage.jsx";
import DiagramPage from "./pages/DiagramPage.jsx";
import RealPage from "./pages/RealPage.jsx";

export const PAGES = [
  { id: "story", label: "Story", View: StoryPage },
  { id: "connect", label: "Connect", View: ConnectPage },
  { id: "link", label: "Link", View: LinkPage },
  { id: "grant", label: "Grant and revoke", View: GrantPage },
  { id: "diagram", label: "Diagram", View: DiagramPage },
  { id: "real", label: "Real", View: RealPage },
];
// Never blank and never claiming one mode before it is known: until the story answers, it says both, honestly.
export const BANNER_UNKNOWN = "SIMULATED, MOCK or REAL mode: a mock Salesforce org and a mock Privilege app, or one read-only look at one org. Every behaviour is observed on one org and one Privilege build, UNVERIFIED as a product claim.";
// Which talk-track steps the presenter sees on each page (ids from the story's talkTrack).
const PRESENTER_TALK = { story: ["say-first"], connect: ["connect", "propagation"], link: ["link"], grant: ["grant", "expire", "drift"], diagram: ["expire"], real: [] };
// Lab-invented items a presenter must not read out as observed, by page (ids from the story's labInvented list).
const PRESENTER_INVENTED = { connect: ["authorized-user-rights"], link: ["case-sensitive"], grant: ["reaper", "reconcile-clears", "drift-names", "durations"], diagram: ["reaper", "reconcile-clears"] };
const THEME_KEY = "sfp.theme";
const FONT_KEY = "sfp.font";
const THEMES = ["auto", "light", "dark"];
function initialTheme() { try { const v = localStorage.getItem(THEME_KEY); if (THEMES.includes(v)) return v; } catch { /* storage blocked */ } return "auto"; }
function initialFont() { try { const f = localStorage.getItem(FONT_KEY); return ["S", "M", "L"].includes(f) ? f : "M"; } catch { return "M"; } }
// "#diagram/<name>" opens that diagram: the page is the part before the slash.
const pageFromHash = () => { const h = window.location.hash.replace("#", "").split("/")[0]; return PAGES.some((p) => p.id === h) ? h : "story"; };

export default function App() {
  const lab = useLab();
  const [page, setPage] = useState(pageFromHash());
  const [presenter, setPresenter] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  const [theme, setTheme] = useState(initialTheme);
  const [fontStep, setFontStep] = useState(initialFont);
  const [resetMsg, setResetMsg] = useState("");

  useEffect(() => { if (theme === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { applyFontSize(fontStep); try { localStorage.setItem(FONT_KEY, fontStep); } catch { /* not remembered */ } }, [fontStep]);
  useEffect(() => { const on = () => setPage(pageFromHash()); window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  useEffect(() => {
    const on = (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === "p" || e.key === "P") setPresenter((v) => !v);
      else if (e.key === "Escape") setPresenter(false);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const pickTheme = (next) => { try { if (next === "auto") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, next); } catch { /* not remembered */ } setTheme(next); };
  const select = (id) => { setPage(id); try { window.history.replaceState(null, "", `#${id}`); } catch { /* ignore */ } };
  const reset = async () => {
    const ok = await lab.reset();
    setResetMsg(ok ? "Reset: the mock org, the mock Privilege app, the receipts, the audit trail and the lab clock are back to the start, and the diagram is back in place." : "Reset failed on the server; the view was reloaded.");
  };

  const { source, story, info } = lab;
  const banner = story && source ? story.banner[source] : BANNER_UNKNOWN;
  const View = PAGES.find((p) => p.id === page).View;
  const say = story ? story.talkTrack.filter((x) => (PRESENTER_TALK[page] || []).includes(x.id)) : [];

  return (
    <div className={`app${presenter ? " app--presenter" : ""}`}>
      <header className="shell-bar">
        <span className="shell-brand">
          <span className="shell-logo" aria-hidden="true">SFP</span>
          <h1>Salesforce Privilege LAB</h1>
          {source && <span className={`shell-badge${source === "real" ? " shell-badge--live" : ""}`} data-testid="mode" title={source === "real" ? "Real: read-only, owner-run" : "Mock: nothing leaves this machine"}>{source === "real" ? "Real" : "Mock"}</span>}
        </span>
        <nav className="shell-nav" aria-label="Lab sections">
          {PAGES.map((p) => <a key={p.id} href={`#${p.id}`} aria-current={page === p.id ? "page" : undefined} onClick={(e) => { e.preventDefault(); select(p.id); }}>{p.label}</a>)}
        </nav>
        <TopMenu
          vertical={{ value: lab.vertical, onChange: lab.setVertical, options: story ? story.verticals : ["finance"] }}
          theme={{ value: theme, onChange: pickTheme }}
          fontSize={{ value: fontStep, onChange: setFontStep }}
          present={{ active: presenter, onToggle: () => setPresenter((v) => !v), label: "Presenter (P)" }}
          talkTrack={{ active: talkOpen, onToggle: () => setTalkOpen((v) => !v) }}
          help={{ href: "https://github.com/curtismu7/salesforce-privilege-LAB#readme" }}
          version={info?.version ? `v${info.version}` : null}
          onReset={reset}
          extra={<ModeToggle source={source || "mock"} info={info} onSwitch={lab.switchMode} />}
        >
          <ShelfLink headers={() => ({ "x-workspace": workspaceId() })} />
          <VerifyMark id="salesforce-privilege-lab" headers={() => ({ "x-workspace": workspaceId() })} />
        </TopMenu>
      </header>
      <main className="page">
        <p className="banner" role="note" data-state={source === "real" ? "live" : "mock"} data-testid="banner">{banner}</p>
        {lab.modeError && <p className="field-error" role="alert" data-testid="mode-error-banner">{lab.modeError}</p>}
        {lab.error && (
          <div className="field-error" role="alert" data-testid="load-error">
            <p>Could not load the lab ({lab.error}). Is the server running?</p>
            <button type="button" onClick={lab.reload} data-testid="retry">Try again</button>
          </div>
        )}
        <p className={resetMsg ? "reset-note" : "sr-only"} role="status" aria-live="polite" data-testid="reset-note">{resetMsg}</p>
        {!presenter && story && <div className="page-head"><p className="head__intro" data-testid="head-intro">{lab.source === "real" ? "Real mode: one read-only look at your own org's permission sets and users. Nothing is granted, changed or deleted; the Connect, Link and Grant pages are for Mock." : story.intro}</p></div>}
        {presenter && <PresenterSay say={say} inventedIds={PRESENTER_INVENTED[page] || []} items={story?.labInvented} />}
        <div id={`panel-${page}`}>
          {lab.error && !story ? null : !story || !info ? <p className="muted" role="status">Loading...</p> : <View key={`${page}-${lab.epoch}`} lab={lab} />}
        </div>
      </main>
      <TalkTrackDialog isOpen={talkOpen} onClose={() => setTalkOpen(false)} talk={story?.talkTrack ?? []} />
    </div>
  );
}
