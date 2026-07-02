import { useEffect, useState } from "react";

/**
 * PWA install prompt banner.
 *
 * Two platforms, two flows:
 * - **Android / desktop Chrome + Edge:** browsers fire `beforeinstallprompt`
 *   when the site is eligible. We capture the event and trade the automatic
 *   mini-banner for our own "Install" button — Chrome only shows the mini
 *   banner once and quietly hides it forever after, which is why users
 *   report "no prompt appeared." An in-app button restores the affordance.
 * - **iOS Safari:** Apple never fires an install prompt event. The only way
 *   to install a PWA is manual: Share sheet → Add to Home Screen. We show
 *   a one-time hint pointing at the Share button so users know it's an
 *   option at all.
 *
 * Hides automatically once the app is running standalone (already installed),
 * and remembers dismissal for 30 days so we don't nag every open.
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "swiftpms.installPromptDismissedAt";
const INSTALLED_KEY = "swiftpms.appInstalled";
const DISMISS_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
const IOS_HINT_DELAY_MS = 4000; // Let the user land + see the app first.

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Match iPhone/iPad/iPod, and iPadOS 13+ which reports as Mac + touch.
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (ua.includes("Macintosh") && "ontouchend" in document)
  );
}

/**
 * Detect whether we're running inside an installed PWA shell.
 *
 * Layered checks because no single signal is reliable across every browser:
 *  - `display-mode: standalone` / `fullscreen` / `minimal-ui` media queries
 *    catch Chrome/Edge/modern Safari when launched from the home screen.
 *  - `navigator.standalone` is the historic iOS Safari flag (still the only
 *    reliable signal on older iOS versions).
 *  - `document.referrer` starting with `android-app://` catches the case
 *    where Android's WebAPK launched us but the media query hadn't updated
 *    by the time we ran (observed on some Samsung/Chrome combos).
 *  - localStorage `appInstalled` flag — set once when `appinstalled` fires
 *    or when we first detect standalone. Belt-and-braces for browsers that
 *    have known-broken standalone detection.
 */
function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (localStorage.getItem(INSTALLED_KEY) === "1") return true;
  } catch {
    // localStorage may be blocked in private browsing — fall through to
    // the runtime checks below.
  }
  if (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches
  ) {
    return true;
  }
  if (
    (navigator as unknown as { standalone?: boolean }).standalone === true
  ) {
    return true;
  }
  if (
    typeof document !== "undefined" &&
    typeof document.referrer === "string" &&
    document.referrer.startsWith("android-app://")
  ) {
    return true;
  }
  return false;
}

/** Persist the "installed" flag so subsequent loads honor it even if the browser's runtime detection glitches. */
function rememberInstalled(): void {
  try {
    localStorage.setItem(INSTALLED_KEY, "1");
  } catch {
    // ignore
  }
}

function wasRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [nativePrompt, setNativePrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) {
      // Persist so we short-circuit on subsequent loads even if the browser
      // runtime detection is flaky (Chrome-on-some-Androids in particular).
      rememberInstalled();
      setInstalled(true);
      return;
    }
    if (wasRecentlyDismissed()) {
      setDismissed(true);
      return;
    }

    // Chrome/Edge/Android: hijack the native install prompt so we can present
    // an in-app button instead. Without preventDefault(), Chrome shows its
    // own mini-infobar exactly once — users who missed it never see it again.
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setNativePrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    // Chrome also fires `appinstalled` when the user completes install via
    // any path (our button OR the URL-bar icon OR menu → Install). Hide the
    // banner instantly in either case.
    function onAppInstalled() {
      rememberInstalled();
      setNativePrompt(null);
      setShowIosHint(false);
      setInstalled(true);
    }
    window.addEventListener("appinstalled", onAppInstalled);

    // iOS Safari: no event ever fires. Show a hint after a short delay so
    // the user has time to see the login/property screens first.
    let iosTimer: number | undefined;
    if (isIos()) {
      iosTimer = window.setTimeout(() => setShowIosHint(true), IOS_HINT_DELAY_MS);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      if (iosTimer !== undefined) window.clearTimeout(iosTimer);
    };
  }, []);

  async function handleInstallClick() {
    if (!nativePrompt) return;
    try {
      await nativePrompt.prompt();
      const { outcome } = await nativePrompt.userChoice;
      if (outcome === "dismissed") {
        // User declined this session — respect that, don't re-show for a
        // month (mirrors the "wasRecentlyDismissed" TTL).
        try {
          localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch {
          // ignore
        }
        setDismissed(true);
      }
    } finally {
      // Chrome only exposes the prompt event ONCE. Whatever the outcome, the
      // handle is now spent — drop our reference.
      setNativePrompt(null);
    }
  }

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // localStorage may be blocked in private browsing — the in-memory
      // dismiss below still hides the banner for this session.
    }
    setDismissed(true);
  }

  if (installed || dismissed) return null;

  // Position: floating banner above the mobile bottom nav (which is h-14 =
  // 3.5rem + safe-area-inset-bottom). Desktop: bottom-right corner.
  const wrapperClasses =
    "fixed z-40 mx-auto max-w-md px-4 " +
    // Sit above MobileNav on mobile; anchor bottom-right on desktop.
    "bottom-20 left-0 right-0 md:bottom-4 md:left-auto md:right-4 md:mx-0 md:max-w-sm md:px-0";

  if (nativePrompt) {
    return (
      <div className={wrapperClasses} role="dialog" aria-labelledby="install-title">
        <div className="rounded-xl border border-primary/30 bg-white shadow-lg">
          <div className="flex items-start gap-3 p-4">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div id="install-title" className="text-sm font-semibold text-foreground">
                Install SwiftPMS
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Add to your home screen for one-tap access.
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleInstallClick}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Install
                </button>
                <button
                  onClick={handleDismiss}
                  className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showIosHint) {
    return (
      <div className={wrapperClasses} role="dialog" aria-labelledby="install-title">
        <div className="rounded-xl border border-primary/30 bg-white shadow-lg">
          <div className="flex items-start gap-3 p-4">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              {/* iOS Share icon — square with up-arrow. */}
              <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M12 3v13.5m0-13.5l-3.75 3.75M12 3l3.75 3.75" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div id="install-title" className="text-sm font-semibold text-foreground">
                Add SwiftPMS to Home Screen
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Tap the Share button in Safari, then <span className="font-medium text-foreground">Add to Home Screen</span>.
              </div>
              <div className="mt-3">
                <button
                  onClick={handleDismiss}
                  className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
