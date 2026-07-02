import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.js";
import { initAuthListener } from "./services/auth.js";
import "./styles/globals.css";

// Initialize Firebase auth state listener
initAuthListener();

// Register the PWA service worker so staff can install to the home screen
// on Android. Disabled on localhost dev to avoid stale-cache surprises.
//
// Update flow: when a new SW takes control (deploy with bumped CACHE_NAME
// in sw.js), reload the page once so staff see the new JS instead of the
// previously-cached bundle.
if (
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  window.location.hostname !== "localhost"
) {
  let reloadGuard = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadGuard) return;
    reloadGuard = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Fire an update check IMMEDIATELY on mount too — the browser only
        // checks the SW script once every 24h by default. If a user opens
        // the tab after a deploy, we don't want them to see stale bundles
        // until the next 60s poll (or worse, wait 24h). This forces an
        // update-if-changed on every page open.
        reg.update().catch(() => {
          // Network blip — the periodic poll below picks it up
        });

        // Also update whenever the tab becomes visible again (user returning
        // from another app / home screen). Catches the case where the tab
        // sat backgrounded through a deploy.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            reg.update().catch(() => {});
          }
        });

        // Long-running poll for tabs left open all day.
        setInterval(() => {
          reg.update().catch(() => {
            // Network blip — try again next tick
          });
        }, 60_000);
      })
      .catch(() => {
        // Silent — SW is best-effort
      });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
