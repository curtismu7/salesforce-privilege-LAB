import { useEffect, useState } from "react";
import TopMenu, { applyFontSize } from "./top-menu/TopMenu.jsx";
import TalkTrackDialog from "./talk-track/TalkTrackDialog.jsx";
import ModeModal from "./mode-modal/ModeModal.jsx";
import ModeToggle from "./components/ModeToggle.jsx";
import ShelfLink from "./components/ShelfLink.jsx";
import VerifyMark from "./components/VerifyMark.jsx";
import useLab from "./hooks/useLab";
import { workspaceId } from "./workspace.js";
import PresenterSay from "./components/PresenterSay.jsx";
import { BEATS, beatOf } from "./support.js";
import SupportPage from "./pages/SupportPage.jsx";
import ScenariosPage from "./pages/ScenariosPage.jsx";
import ConnectPage from "./pages/ConnectPage.jsx";
import LinkPage from "./pages/LinkPage.jsx";
import GrantPage from "./pages/GrantPage.jsx";
import DiagramPage from "./pages/DiagramPage.jsx";
import RealPage from "./pages/RealPage.jsx";

export const PAGES = [
  { id: "support", label: "Support P1", View: SupportPage },
  { id: "scenarios", label: "Scenarios", View: ScenariosPage },
  { id: "connect", label: "Connect", View: ConnectPage },
  { id: "link", label: "Link", View: LinkPage },
  { id: "grant", label: "Grant and revoke", View: GrantPage },
  { id: "diagram", label: "Diagram", View: DiagramPage },
  { id: "real", label: "Real", View: RealPage },
];
// Real-or-mock modal (shared mode-modal): it replaces the simulation banner, the lab's one honesty text. The words are the old banner's, moved here
// (the server's story.banner stays, tests pin it). The modal stays off until the mode is known, so it never claims one before it knows.
export const MODE_LINES = {
  mock: "Simulated: every behaviour shown was recorded in one real Privilege and Salesforce run.",
  real: "Read-only, owner-run: one sign-in (a signed JWT, RS256) to the one Salesforce origin named in this lab's own .env, then a list of that org's permission sets and users. Nothing is granted, changed or deleted, and the private key is write-only and never shown or logged.",
};
// Which talk-track items the presenter sees on each page (ids from the story's talkTrack). The Support P1 page shows the beat the world is in.
const PRESENTER_TALK = { scenarios: ["beat-1", "beat-2", "beat-3"], connect: ["connect"], link: ["link"], grant: ["grant"], diagram: ["grant"], real: [] };
// One line per page above the content; the Support P1 page shows the story's own intro from the server.
const PAGE_INTRO = {
  scenarios: "Twelve scripted runs of the lab's own engine against the mock org: every step shows what was expected and what happened, with the raw request and response.",
  connect: "Connecting the mock org to the mock Privilege app: the sign-in check shows every failure the setup guide records, with its cause and exact fix.",
  link: "Linking a person: Privilege matches a Salesforce user on an identical email.",
  grant: "Granting a permission set with a duration, and removing it by deleting its policy.",
  diagram: "Two diagrams of the mock exchanges: connect and link, and grant and revoke.",
  real: "",
};
const THEME_KEY = "sfp.theme";
const FONT_KEY = "sfp.font";
const THEMES = ["auto", "light", "dark"];
function initialTheme() { try { const v = localStorage.getItem(THEME_KEY); if (THEMES.includes(v)) return v; } catch { /* storage blocked */ } return "auto"; }
function initialFont() { try { const f = localStorage.getItem(FONT_KEY); return ["S", "M", "L"].includes(f) ? f : "M"; } catch { return "M"; } }
// "#diagram/<name>" opens that diagram: the page is the part before the slash.
const pageFromHash = () => { const h = window.location.hash.replace("#", "").split("/")[0]; return PAGES.some((p) => p.id === h) ? h : "support"; };

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
  const View = PAGES.find((p) => p.id === page).View;
  const beat = page === "support" ? beatOf(lab.state?.support) : 0;
  const say = !story ? [] : page === "support" ? story.talkTrack.filter((x) => x.id === `beat-${beat || 1}`) : story.talkTrack.filter((x) => (PRESENTER_TALK[page] || []).includes(x.id));

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
          vertical={{ value: lab.vertical, onChange: lab.setVertical, options: story ? story.verticals : ["airlines"] }}
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
        {lab.modeError && <p className="field-error" role="alert" data-testid="mode-error-banner">{lab.modeError}</p>}
        {lab.error && (
          <div className="field-error" role="alert" data-testid="load-error">
            <p>Could not load the lab ({lab.error}). Is the server running?</p>
            <button type="button" onClick={lab.reload} data-testid="retry">Try again</button>
          </div>
        )}
        <p className={resetMsg ? "reset-note" : "sr-only"} role="status" aria-live="polite" data-testid="reset-note">{resetMsg}</p>
        {!presenter && story && (lab.source === "real" || page === "support" || PAGE_INTRO[page]) && <div className="page-head"><p className="head__intro" data-testid="head-intro">{lab.source === "real" ? "Real mode: one read-only look at your own org's permission sets and users. Nothing is granted, changed or deleted; the Support P1, Connect, Link and Grant pages are for Mock." : page === "support" ? story.intro : PAGE_INTRO[page]}</p></div>}
        {presenter && <PresenterSay say={say} heading={page === "support" ? `Beat ${beat || 1} of 3: ${BEATS[(beat || 1) - 1]}` : null} />}
        <div id={`panel-${page}`}>
          {lab.error && !story ? null : !story || !info ? <p className="muted" role="status">Loading...</p> : <View key={`${page}-${lab.epoch}`} lab={lab} />}
        </div>
      </main>
      <ModeModal mode={source === "real" ? "real" : "mock"} lines={MODE_LINES} suppress={!source} storageKey="sfp-mode" />
      <TalkTrackDialog isOpen={talkOpen} onClose={() => setTalkOpen(false)} talk={story?.talkTrack ?? []} />
    </div>
  );
}
