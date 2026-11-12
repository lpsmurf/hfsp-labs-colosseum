// Operational alerts. Posts to Telegram when TELEGRAM_ALERT_BOT_TOKEN and
// TELEGRAM_ALERT_CHAT_ID are set; always writes "[ALERT]" to stderr, which PM2
// captures, so nothing is lost when no bot is configured. Never throws — an
// alert failure must not affect the order path.
const TOKEN = process.env.TELEGRAM_ALERT_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_ALERT_CHAT_ID;

export async function alert(subject: string, detail?: Record<string, unknown> | string): Promise<void> {
  const body = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "";
  console.error(`[ALERT] ${subject}${body ? ` ${body}` : ""}`);
  if (!TOKEN || !CHAT) return;
  try {
    const text = `⚠️ *Celo store*\n${subject}${body ? `\n\`${body.slice(0, 800)}\`` : ""}`;
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "Markdown", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    console.error("[ALERT] telegram send failed:", err instanceof Error ? err.message : err);
  }
}
