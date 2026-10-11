import { useEffect, useState } from "react";

/**
 * useMediaQuery - true while the CSS media query matches.
 * Used so phone-only data fetches (e.g. extra per-sensor lookups for the
 * mobile cards) do not run on desktop, keeping desktop network traffic
 * exactly as it was.
 */
export function useMediaQuery(query) {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

// Matches Tailwind's `lg` breakpoint (below 1024px = phone / small tablet shell).
export const MOBILE_QUERY = "(max-width: 1023.98px)";
export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
