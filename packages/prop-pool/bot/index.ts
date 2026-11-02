/**
 * PropPool Telegram bot (grammY).
 *
 * Commands: /start, /link <wallet>, /wallet, /prop (guided prop creation),
 * /mypools. Posts a shareable prop card whose "Open in app" button launches the
 * Mini App (create for the creator, join for friends). A background watcher posts
 * a "TxLINE-proven" result card when a tracked prop settles.
 *
 * The bot NEVER holds keys — every on-chain write happens in the Mini App with
 * the user's own wallet. Needs TELEGRAM_BOT_TOKEN + a hosted Mini App (MINIAPP_URL).
 *
 * Run:  npm run bot
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Bot, Context, InlineKeyboard, session, type SessionFlavor } from "grammy";
import { Connection, PublicKey } from "@solana/web3.js";
import { loadConfig, PKG } from "./config";
import { Store } from "./store";
import { readProgram, positionsForWallet, fetchProp, isStatus } from "./chain";
import { STAT_OPTIONS, statLabel, propSummary } from "./labels";
import { createLink, joinLink, derivePropPda, DEFAULT_PERIOD, type PropParams } from "./links";
import { createClient, getFixturesSnapshot } from "../src/txline/index";

const cfg = loadConfig();
const store = new Store(cfg.storePath);
const connection = new Connection(cfg.rpcUrl, "confirmed");
const program = readProgram(connection);

interface Wizard {
  step: "idle" | "await_threshold";
  fixtures?: { id: string; label: string }[];
  fixtureId?: string;
  fixtureLabel?: string;
  statKey?: number;
  cmp?: "lt" | "gt";
}
type Ctx = Context & SessionFlavor<{ wizard: Wizard }>;

const bot = new Bot<Ctx>(cfg.token);
bot.use(session({ initial: (): { wizard: Wizard } => ({ wizard: { step: "idle" } }) }));

const isPubkey = (s: string) => {
  try { new PublicKey(s); return true; } catch { return false; }
};

// Fixtures from the cached TxLINE session (if the crank/M0 has authed already).
async function listFixtures(): Promise<{ id: string; label: string }[]> {
  const cache = resolve(PKG, ".m0-cache.json");
  if (!existsSync(cache)) return [];
  const { jwt, apiToken } = JSON.parse(readFileSync(cache, "utf8"));
  const client = createClient({ apiOrigin: "https://txline-dev.txodds.com", jwt, apiToken });
  const fx = await getFixturesSnapshot(client);
  return fx.slice(0, 6).map((f) => ({ id: String(f.FixtureId), label: `${f.Participant1} v ${f.Participant2}` }));
}

bot.command("start", (ctx) =>
  ctx.reply(
    "⚽ *PropPool* — parametric prop bets that auto-settle from TxLINE on-chain proofs.\n\n" +
      "1. `/link <your Solana wallet>` — link your devnet wallet\n" +
      "2. `/prop` — create a prop and share it\n" +
      "3. `/mypools` — see your positions\n\n" +
      "_Devnet only. Stakes in USDC. UNAUDITED._",
    { parse_mode: "Markdown" }
  )
);

bot.command("link", (ctx) => {
  const arg = ctx.match?.trim();
  if (!arg || !isPubkey(arg)) return ctx.reply("Usage: `/link <Solana wallet pubkey>`", { parse_mode: "Markdown" });
  store.linkWallet(ctx.from!.id, arg);
  return ctx.reply(`Linked wallet \`${arg}\` ✅`, { parse_mode: "Markdown" });
});

bot.command("wallet", (ctx) => {
  const w = store.getWallet(ctx.from!.id);
  return ctx.reply(w ? `Your wallet: \`${w}\`` : "No wallet linked. Use `/link <wallet>`.", { parse_mode: "Markdown" });
});

bot.command("prop", async (ctx) => {
  if (!store.getWallet(ctx.from!.id)) return ctx.reply("Link a wallet first: `/link <wallet>`", { parse_mode: "Markdown" });
  const fixtures = await listFixtures().catch(() => []);
  ctx.session.wizard = { step: "idle", fixtures };
  if (!fixtures.length) return ctx.reply("No live fixtures available right now. Try again later.");
  const kb = new InlineKeyboard();
  fixtures.forEach((f, i) => kb.text(f.label, `fx:${i}`).row());
  return ctx.reply("🏆 Pick a match:", { reply_markup: kb });
});

bot.callbackQuery(/^fx:(\d+)$/, async (ctx) => {
  const f = ctx.session.wizard.fixtures?.[Number(ctx.match![1])];
  if (!f) return ctx.answerCallbackQuery("expired — /prop again");
  ctx.session.wizard.fixtureId = f.id;
  ctx.session.wizard.fixtureLabel = f.label;
  const kb = new InlineKeyboard();
  STAT_OPTIONS.forEach((s, i) => { kb.text(s.label, `st:${s.key}`); if (i % 2) kb.row(); });
  await ctx.answerCallbackQuery();
  return ctx.editMessageText(`⚽ ${f.label}\n\nPick a stat:`, { reply_markup: kb });
});

bot.callbackQuery(/^st:(\d+)$/, async (ctx) => {
  ctx.session.wizard.statKey = Number(ctx.match![1]);
  const kb = new InlineKeyboard().text("Over ▲", "cmp:gt").text("Under ▼", "cmp:lt");
  await ctx.answerCallbackQuery();
  return ctx.editMessageText(`Stat: ${statLabel(ctx.session.wizard.statKey!)}\n\nOver or under?`, { reply_markup: kb });
});

bot.callbackQuery(/^cmp:(lt|gt)$/, async (ctx) => {
  ctx.session.wizard.cmp = ctx.match![1] as "lt" | "gt";
  ctx.session.wizard.step = "await_threshold";
  await ctx.answerCallbackQuery();
  return ctx.editMessageText(
    `${statLabel(ctx.session.wizard.statKey!)} ${ctx.session.wizard.cmp === "gt" ? "over" : "under"} …\n\n` +
      "Reply with the threshold number (e.g. `10`).",
    { parse_mode: "Markdown" }
  );
});

bot.on("message:text", async (ctx, next) => {
  const w = ctx.session.wizard;
  if (w.step !== "await_threshold") return next();
  const threshold = Number(ctx.message.text.trim());
  if (!Number.isInteger(threshold)) return ctx.reply("Please reply with a whole number, e.g. `10`.", { parse_mode: "Markdown" });

  const creator = store.getWallet(ctx.from!.id)!;
  const nonce = String(Date.now());
  const params: PropParams = {
    creator, nonce, fixtureId: w.fixtureId!, statKey: w.statKey!, period: DEFAULT_PERIOD,
    threshold, cmp: w.cmp!, mint: cfg.stakeMint,
  };
  const propPda = derivePropPda(program.programId, new PublicKey(creator), params.fixtureId, nonce).toBase58();
  store.setPropChat(propPda, ctx.chat.id);
  ctx.session.wizard = { step: "idle" };

  const kb = new InlineKeyboard()
    .webApp("🎮 Open in app (stake USDC)", createLink(cfg.miniappUrl, propPda, params))
    .row()
    .url("🔗 Share", `https://t.me/share/url?url=${encodeURIComponent(joinLink(cfg.miniappUrl, propPda))}`);
  return ctx.reply(
    `🎯 *New prop*\n${w.fixtureLabel}\n*${statLabel(w.statKey!)} ${w.cmp === "gt" ? "over" : "under"} ${threshold}*\n\n` +
      `Tap below to stake USDC. Friends can join the same pool.\nProp: \`${propPda}\``,
    { parse_mode: "Markdown", reply_markup: kb }
  );
});

bot.command("mypools", async (ctx) => {
  const w = store.getWallet(ctx.from!.id);
  if (!w) return ctx.reply("Link a wallet first: `/link <wallet>`", { parse_mode: "Markdown" });
  const positions = await positionsForWallet(program, connection, new PublicKey(w));
  if (!positions.length) return ctx.reply("You have no positions yet. Create one with /prop.");
  const lines = await Promise.all(
    positions.map(async ({ account }) => {
      const p = await fetchProp(program, account.prop);
      const status = p ? (isStatus(p.status, "settled") ? "settled" : isStatus(p.status, "refundable") ? "refundable" : "open") : "?";
      const side = account.side ? "OVER" : "UNDER";
      return `• ${p ? propSummary(p) : account.prop.toBase58().slice(0, 8)} — ${side}, ${Number(account.stake) / 1e6} USDC [${status}]`;
    })
  );
  return ctx.reply(`📊 *Your positions*\n${lines.join("\n")}`, { parse_mode: "Markdown" });
});

// ── Settlement watcher: post a result card when a tracked prop settles ──────────
async function watch() {
  for (const propStr of store.trackedProps()) {
    if (store.isAnnounced(propStr)) continue;
    const p = await fetchProp(program, new PublicKey(propStr)).catch(() => null);
    if (!p || !isStatus(p.status, "settled")) continue;
    const chatId = store.getPropChat(propStr);
    if (chatId == null) continue;
    const outcome = p.winningSide ? "OVER wins ▲" : "UNDER wins ▼";
    await bot.api.sendMessage(
      chatId,
      `🏁 *Settled* — ${propSummary(p)}\n*${outcome}*\n\n✅ TxLINE-proven on-chain: \`${propStr}\``,
      { parse_mode: "Markdown" }
    ).catch(() => {});
    store.markAnnounced(propStr);
  }
}

async function main() {
  setInterval(() => watch().catch(() => {}), cfg.watchIntervalMs);
  console.log(`PropPool bot up. program=${program.programId.toBase58()} miniapp=${cfg.miniappUrl}`);
  await bot.start();
}
main().catch((e) => { console.error(e); process.exit(1); });
