import { useEffect, useRef, useState } from "react";
import GoogleGlyph from "./GoogleGlyph.jsx";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/**
 * GoogleSignInButton
 * --------------------
 * Renders Google's own official Identity Services button (real OAuth,
 * verified server-side by backend's POST /auth/google) whenever
 * VITE_GOOGLE_CLIENT_ID is configured and Google's script has loaded.
 *
 * If no client ID is configured, falls back to a styled placeholder
 * button that calls `onUnavailableClick` instead - an honest "not set
 * up yet" state, never a fake/simulated login.
 */
export default function GoogleSignInButton({ onCredential, onUnavailableClick }) {
  const containerRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    let attempts = 0;

    function init() {
      if (cancelled) return;
      if (!window.google?.accounts?.id) {
        // accounts.google.com/gsi/client loads async - retry briefly.
        attempts += 1;
        if (attempts > 40) {
          setFailed(true); // ~6s of retrying with no luck - script likely blocked
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

  if (!CLIENT_ID || failed) {
    return (
      <button
        type="button"
        onClick={onUnavailableClick}
        className="w-full py-3 rounded-xl text-sm font-semibold bg-auth-blue text-white hover:bg-auth-blueDark flex items-center justify-center gap-2.5 transition-colors"
      >
        <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
          <GoogleGlyph size={13} />
        </span>
        Continue with Google
      </button>
    );
  }

  return <div ref={containerRef} className="w-full flex justify-center" />;
}
