// Read-only refresh loop: one request at a time, paused in background tabs.
// Returning false ends the loop (for example, after a payment is confirmed).
export function startVisibleRefresh(task, { interval = 15000, page = document, host = window, clock = globalThis } = {}) {
  const controller = new AbortController();
  let running = false;
  let stopped = false;
  let timer;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    clock.clearTimeout(timer);
    page.removeEventListener('visibilitychange', wake);
    host.removeEventListener('focus', wake);
  };
  const run = async () => {
    if (stopped || running || page.hidden) return;
    clock.clearTimeout(timer);
    running = true;
    try {
      if (await task(controller.signal) === false) stop();
    } catch { /* A transient read failure is retried; this loop never sends. */ }
    finally {
      running = false;
      if (!stopped && !page.hidden) timer = clock.setTimeout(run, interval);
    }
  };
  function wake() {
    clock.clearTimeout(timer);
    if (!page.hidden) void run();
  }
  page.addEventListener('visibilitychange', wake);
  host.addEventListener('focus', wake);
  void run();
  return stop;
}
