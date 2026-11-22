# Web UI notes

Pages (hash routes, one shell, banner first on every page and in presenter mode): Story, Connect, Link, Grant and revoke, Diagram, Real. The header carries the Mock / Real toggle (two buttons, the current mode pressed) on every page; a press is `POST /api/mode` with exactly `{source}`, then info, story and state are loaded again.

- All writes go through `POST /api/actions` (`refusalsAs200: true`, so a refusal the visitor asked for is data, not a console error). Scenarios use `POST /api/scenarios/:id/run` with `upTo` (Run shows step 1, Next step adds one).
- Every JSON pane is the shared `JsonPane` (opens on JSON in this lab). Nothing is decoded or parsed by hand.
- Three labels (observed, lab-inferred, lab-invented) come from the server's `basis` and `label` fields; the page words nothing of its own about them except where it shows the server's `labInvented` text by id.
- The diagram is `GET /api/diagram?name=<name>&vertical=<v>` (diagram-studio data shaped as `{title, intro, nodes[{id,label,kind,x,y}], steps[{from,to,label,say}]}`); names used: `connect-and-link`, `grant-expire-revoke`. The page draws nothing the data does not list.
- Tests run the repo's own Express app in process (`web/src/test/harness.js`), so a click meets the real engine. Real is an in-process fake; nothing leaves the machine.
- One port (7835): `npm run dev -w web` rebuilds `web/dist` on change and the running API serves it.
