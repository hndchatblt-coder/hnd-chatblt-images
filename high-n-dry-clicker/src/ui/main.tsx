import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { validateConfig } from "../engine/index.js";
import App from "./App.js";
import "./styles.css";

// Fail loudly at boot rather than mid-run if the config is ever wrong.
validateConfig();

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
