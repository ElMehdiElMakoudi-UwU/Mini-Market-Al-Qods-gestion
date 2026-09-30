export async function register() {
  // The alert worker runs inside the server process (no separate cron needed).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAlertWorker } = await import("./lib/alerts");
    startAlertWorker();
  }
}
