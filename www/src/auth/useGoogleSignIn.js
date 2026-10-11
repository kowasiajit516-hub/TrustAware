/**
 * src/auth/useGoogleSignIn.js
 * -----------------------------
 * Thin wrapper around Google Identity Services (the <script> tag loaded
 * in index.html) for the "Continue with Google" buttons on Login and
 * Register.
 *
 * How it actually works, end to end:
 *  1. Google's script exposes a global `window.google.accounts.id` API.
 *  2. We call `.initialize()` once, with our Client ID and a callback.
 *  3. When the button is clicked, we call `.prompt()`, which is allowed
 *     here because it runs inside a real user click handler (browsers
 *     block it as a popup otherwise).
 *  4. Google shows its own account picker. On success, it calls our
 *     callback with a `credential` field - that's a signed JWT ID token,
 *     Google's proof of who signed in.
 *  5. We POST that raw token to our OWN backend's /auth/google, which
 *     verifies it server-side before trusting anything in it. We never
 *     trust the token's contents ourselves - the backend is the one
 *     source of truth for "is this a real, valid Google sign-in".
 *
 * If VITE_GOOGLE_CLIENT_ID is not set, `ready` stays false and the
 * calling page should render the disabled/disclaimer state instead -
 * exactly like before this feature existed, so an unconfigured
 * deployment fails safe rather than showing a broken button.
 */
import { useEffect, useRef, useState, useCallback } from "react";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

function waitForGoogleScript(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error("Google Identity Services script did not load in time"));
      }
    }, 50);
  });
}

/**
 * @param {(idToken: string) => void} onCredential - called with the raw
 *   Google ID token once the user picks an account. The page is
 *   responsible for POSTing it to the backend and handling the result.
 */
export function useGoogleSignIn(onCredential) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;

  useEffect(() => {
    if (!CLIENT_ID) return; // feature disabled - stays not-ready on purpose

    let cancelled = false;
    waitForGoogleScript()
      .then(() => {
        if (cancelled) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => callbackRef.current(response.credential),
        });
        setReady(true);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const promptSignIn = useCallback(() => {
    if (!ready) return;
    window.google.accounts.id.prompt();
  }, [ready]);

  return { ready, error, promptSignIn, enabled: Boolean(CLIENT_ID) };
}
