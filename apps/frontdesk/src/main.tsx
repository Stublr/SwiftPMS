import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.js";
import { initAuthListener } from "./services/auth.js";
import "./styles/globals.css";

// Initialize Firebase auth state listener
initAuthListener();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
