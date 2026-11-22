// Rule 19: the Mock / Real toggle in the header of every page. Two buttons, the current mode pressed (aria-pressed, filled accent from the shared
// .mode-toggle block). A press asks the server (POST /api/mode with exactly { source }) and the lab reloads all its data after it. Real is disabled
// with the how-to as its tooltip while the server says it is not configured; a 409 the server still gives is shown by the page.
export default function ModeToggle({ source, info, onSwitch }) {
  const realOff = info ? info.realAvailable === false : false;
  const how = info?.realReason || "Real is not configured. Mock keeps working.";
  return (
    <span className="mode-toggle" role="group" aria-label="Mock or Real" data-testid="mode-toggle">
      <button type="button" aria-pressed={source === "mock"} onClick={() => onSwitch("mock")} data-testid="mode-mock" title="Mock: a mock org in this process, nothing leaves the machine">Mock</button>
      <button type="button" aria-pressed={source === "real"} disabled={realOff} onClick={() => onSwitch("real")} data-testid="mode-real"
        title={realOff ? how : "Real: one read-only look at the one configured org (owner-run)"}>Real</button>
    </span>
  );
}
