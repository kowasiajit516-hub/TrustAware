/**
 * src/auth/googleOrigin.js
 * -------------------------
 * Google only accepts https:// origins - or http://localhost - as "Authorized
 * JavaScript origins", and never a raw IP address. Signing in from e.g.
 * http://192.168.0.100:5173, or http://<name>.ngrok-free.dev (no "s"), ends on
 * Google's "Error 400: origin_mismatch" page (or, with the One Tap prompt, silently
 * does nothing). Detect those addresses up front so the UI can explain instead.
 *
 * GOOGLE_BLOCK_REASON: "ip" | "http" | null   (null = Google can be used here)
 */
const HOST = typeof window !== "undefined" ? window.location.hostname : "";
const IS_IP = /^\d{1,3}(\.\d{1,3}){3}$/.test(HOST);
const IS_PLAIN_HTTP = typeof window !== "undefined" && window.location.protocol === "http:";

export const GOOGLE_BLOCK_REASON = IS_IP ? "ip" : IS_PLAIN_HTTP && HOST !== "localhost" ? "http" : null;

export const GOOGLE_BLOCK_MESSAGES = {
  ip: "Google sign-in doesn't work on an IP address. Open this app at http://localhost:5173 (on the PC) or your https tunnel address, or use email & password.",
  http: "Google sign-in needs a secure address. Open the https:// version of this site (your tunnel address), or http://localhost:5173 on the PC, or use email & password.",
};
