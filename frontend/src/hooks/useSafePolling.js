import { useCallback, useEffect, useRef, useState } from "react";

// Polling that never hangs on "Loading…":
//  * `loading` is true only until the FIRST attempt finishes (success OR failure)
//  * the `error` of a failed attempt is exposed (the previous `data` is kept, so a temporary
//    network problem does not blank a page that already has readings)
//  * never two requests in flight at once; a hung request is abandoned after `timeoutMs`
//  * after failures the next attempt waits longer (backoff, capped); `retry()` tries immediately
//  * pauses while the browser tab is hidden
// `intervalMs` may be a number or a function (data) => ms.
export function useSafePolling(fetcher, deps = [], intervalMs = 3000, { timeoutMs = 45000, maxBackoffMs = 30000 } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true, refreshing: false, failures: 0, lastOk: null });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const intervalRef = useRef(intervalMs);
  intervalRef.current = intervalMs;
  const ctrl = useRef(null);

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    let timer = null;
    let failures = 0;
    let lastData = null;
    setState({ data: null, error: null, loading: true, refreshing: false, failures: 0, lastOk: null });

    const delay = () => {
      const base = typeof intervalRef.current === "function" ? intervalRef.current(lastData) : intervalRef.current;
      return Math.min(maxBackoffMs, base * 2 ** Math.min(failures, 5));
    };
    const schedule = () => {
      if (!alive) return;
      clearTimeout(timer);
      timer = setTimeout(tick, delay());
    };
    const withTimeout = (p) =>
      new Promise((resolve, reject) => {
        const msg = `No answer from the backend after ${Math.round(timeoutMs / 1000)}s`;
        const t = setTimeout(() => reject(Object.assign(new Error(msg), { status: 0, detail: msg })), timeoutMs);
        Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
      });

    async function run() {
      if (inFlight || !alive) return;
      inFlight = true;
      setState((s) => ({ ...s, refreshing: true }));
      try {
        const data = await withTimeout(fetcherRef.current());
        if (!alive) return;
        failures = 0;
        lastData = data;
        setState({ data, error: null, loading: false, refreshing: false, failures: 0, lastOk: Date.now() });
      } catch (error) {
        if (!alive) return;
        failures += 1;
        setState((s) => ({ ...s, error, loading: false, refreshing: false, failures }));
      } finally {
        inFlight = false;
        schedule();
      }
    }
    function tick() {
      if (typeof document !== "undefined" && document.hidden) return schedule();
      run();
    }

    ctrl.current = { now: () => { failures = 0; clearTimeout(timer); run(); } };
    run();
    return () => {
      alive = false;
      clearTimeout(timer);
      ctrl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const retry = useCallback(() => ctrl.current?.now(), []);
  return { ...state, retry };
}
