import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { GoogleSignIn, ErrorCode } from "@capawesome/capacitor-google-sign-in";
import GoogleGlyph from "./GoogleGlyph.jsx";
import { GOOGLE_BLOCK_REASON as BLOCK_REASON } from "../auth/googleOrigin.js";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const IS_NATIVE = Capacitor.isNativePlatform();

/**
 * GoogleSignInButton
 * --------------------
 * On the web dashboard: renders Google's own Identity Services button
 * (the original web GSI flow), unchanged from before.
 *
 * Inside the Capacitor Android app: uses @capawesome/capacitor-google-sign-in,
 * which drives Android's native Credential Manager UI instead of the web
 * GSI popup. The web GSI flow doesn't work inside an embedded WebView
 * (Google's popup relies on window.opener.postMessage, which Android
 * severs when the picker opens as a separate browser process) - the
 * native plugin avoids that entirely.
 *
 * Both paths end up calling onCredential(idToken) with a Google ID token
 * (JWT), which Login.jsx sends to POST /auth/google exactly the same way
 * either way - no backend changes needed.
 */
export default function GoogleSignInButton({ onCredential, onUnavailableClick }) {
  const containerRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [nativeInitialized, setNativeInitialized] = useState(false);
  const [nativeLoading, setNativeLoading] = useState(false);

  // ---- Native (Android app) path ----
  useEffect(() => {
    if (!IS_NATIVE || !CLIENT_ID || BLOCK_REASON) return;
    let cancelled = false;
    GoogleSignIn.initialize({ clientId: CLIENT_ID })
      .then(() => {
        if (!cancelled) setNativeInitialized(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleNativeClick() {
    setNativeLoading(true);
    try {
      const result = await GoogleSignIn.signIn();
      onCredential(result.idToken);
    } catch (error) {
      if (error?.code === ErrorCode.SignInCanceled) {
        // user backed out of the picker - not an error, just do nothing
      } else if (error?.code === ErrorCode.NoCredentialAvailable) {
        onUnavailableClick?.("no-account");
      } else if (error?.code === ErrorCode.ProviderConfigurationError) {
        onUnavailableClick?.("provider-config");
      } else {
        onUnavailableClick?.("unknown");
      }
    } finally {
      setNativeLoading(false);
    }
  }

  // ---- Web (browser dashboard) path - original GSI script flow ----
  useEffect(() => {
    if (IS_NATIVE || !CLIENT_ID || BLOCK_REASON) return;
    let cancelled = false;
    let attempts = 0;

    function init() {
      if (cancelled) return;
      if (!window.google?.accounts?.id) {
        attempts += 1;
        if (attempts > 40) {
          setFailed(true);
          return;
        }
        setTimeout(init, 150);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response) => onCredential(response.credential),
      });
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth || 360;
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: "filled_blue",
          size: "large",
          shape: "pill",
          width,
          text: "continue_with",
        });
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [onCredential]);

  if (!CLIENT_ID || failed || BLOCK_REASON) {
    return (
      <button
        type="button"
        onClick={() => onUnavailableClick?.(CLIENT_ID && BLOCK_REASON ? BLOCK_REASON : undefined)}
        className="w-full py-3 rounded-xl text-sm font-semibold bg-auth-blue text-white hover:bg-auth-blueDark flex items-center justify-center gap-2.5 transition-colors"
      >
        <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
          <GoogleGlyph size={13} />
        </span>
        Continue with Google
      </button>
    );
  }

  if (IS_NATIVE) {
    return (
      <button
        type="button"
        disabled={!nativeInitialized || nativeLoading}
        onClick={handleNativeClick}
        className="w-full py-3 rounded-xl text-sm font-semibold bg-auth-blue text-white hover:bg-auth-blueDark disabled:opacity-50 flex items-center justify-center gap-2.5 transition-colors"
      >
        <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
          <GoogleGlyph size={13} />
        </span>
        {nativeLoading ? "Signing in…" : "Continue with Google"}
      </button>
    );
  }

  return <div ref={containerRef} className="w-full flex justify-center" />;
}
