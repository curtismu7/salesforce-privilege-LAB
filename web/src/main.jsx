import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./top-menu/top-menu.css";
import "./styles/standalone-ui.css";
import "./components/JsonPane.css";
import "./components/VerifyMark.css";
import "./app.css";
import { setDefaultJsonView } from "./components/JsonPane.jsx";

// This lab teaches the wire format, so a pane opens on JSON (the exact request and response); a visitor's own Form / JSON choice still wins.
setDefaultJsonView("raw");

createRoot(document.getElementById("root")).render(<App />);
