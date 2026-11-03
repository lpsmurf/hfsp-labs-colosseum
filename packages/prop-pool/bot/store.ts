/**
 * Tiny JSON-file store (gitignored). Maps:
 *  - telegram user id  -> linked wallet pubkey (base58)
 *  - prop pubkey       -> the chat id where its card was posted (for result cards)
 *  - announced         -> set of prop pubkeys already announced as settled
 *
 * Good enough for a devnet demo; swap for Redis/Postgres in production.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

interface Data {
  wallets: Record<string, string>; // telegramUserId -> wallet
  propChats: Record<string, number>; // propPubkey -> chatId
  announced: string[]; // propPubkeys announced settled
}

export class Store {
  private data: Data;
  constructor(private path: string) {
    this.data = existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8"))
      : { wallets: {}, propChats: {}, announced: [] };
  }
  private save() {
    writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }
  linkWallet(userId: number, wallet: string) {
    this.data.wallets[String(userId)] = wallet;
    this.save();
  }
  getWallet(userId: number): string | undefined {
    return this.data.wallets[String(userId)];
  }
  setPropChat(prop: string, chatId: number) {
    this.data.propChats[prop] = chatId;
    this.save();
  }
  getPropChat(prop: string): number | undefined {
    return this.data.propChats[prop];
  }
  isAnnounced(prop: string): boolean {
    return this.data.announced.includes(prop);
  }
  markAnnounced(prop: string) {
    if (!this.data.announced.includes(prop)) {
      this.data.announced.push(prop);
      this.save();
    }
  }
  trackedProps(): string[] {
    return Object.keys(this.data.propChats);
  }
}
