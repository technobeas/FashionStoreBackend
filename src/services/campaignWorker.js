import { processScheduledCampaigns } from "./campaignService.js";

let timer = null;
let running = false;

export async function processCampaigns() {
  if (running) return;
  running = true;
  try { await processScheduledCampaigns(); }
  catch (e) { console.error("Campaign worker error:", e.message); }
  finally { running = false; }
}

export function startCampaignWorker(intervalMs = 30000) {
  if (timer) return;
  const ms = Math.max(5000, Number(intervalMs) || 30000);
  timer = setInterval(processCampaigns, ms);
  timer.unref?.();
  void processCampaigns();
  console.log(`Campaign worker started (${ms}ms interval).`);
}

export function stopCampaignWorker() { if (timer) clearInterval(timer); timer = null; }
