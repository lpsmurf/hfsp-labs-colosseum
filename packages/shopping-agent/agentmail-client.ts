/**
 * agentmail-client.ts — the agent's OWN email.
 *
 * Thin, typed wrapper over the AgentMail REST API so each agent can provision
 * its own inbox and run two-way threaded email. Implemented with the REST API
 * directly (global fetch) rather than the `agentmail` SDK so this stub
 * typechecks and runs with zero extra install — the SDK is a drop-in upgrade
 * (see PREP-KIT.md → AgentMail).
 *
 * Docs (verified 2026-06-27):
 *   - https://docs.agentmail.to/introduction
 *   - https://docs.agentmail.to/api-reference   (base: https://api.agentmail.to/v0)
 *   - Node SDK: `npm i agentmail` → new AgentMailClient({ apiKey })
 *
 * Auth: Authorization: Bearer <AGENTMAIL_API_KEY>
 */

import type { InboundMessage, InboxRef, MailProvider } from "./providers.js";

const DEFAULT_BASE = "https://api.agentmail.to/v0";

export interface AgentMailConfig {
  apiKey: string;
  /** Override for testing/self-host. Defaults to the public API. */
  baseUrl?: string;
}

// Shapes below mirror the documented response fields; kept minimal on purpose.
interface AmInbox {
  inbox_id: string;
  address?: string;
  username?: string;
  domain?: string;
}
interface AmMessage {
  message_id: string;
  thread_id?: string;
  from?: string;
  subject?: string;
  text?: string;
  extracted_text?: string;
}
interface AmMessageList {
  messages: AmMessage[];
}

export class AgentMailClient implements MailProvider {
  private readonly base: string;
  constructor(private readonly config: AgentMailConfig) {
    this.base = (config.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`AgentMail ${method} ${path} → ${res.status} ${res.statusText} ${detail}`);
    }
    return (await res.json()) as T;
  }

  /** POST /inboxes — provision a dedicated inbox for one agent. */
  async createInbox(clientId: string): Promise<InboxRef> {
    const inbox = await this.request<AmInbox>("POST", "/inboxes", { client_id: clientId });
    return {
      inboxId: inbox.inbox_id,
      address: inbox.address ?? `${inbox.username}@${inbox.domain}`,
    };
  }

  /** POST /inboxes/{id}/messages/send — send a fresh message. */
  async send(
    inboxId: string,
    to: string,
    subject: string,
    body: { text?: string; html?: string },
  ): Promise<{ messageId: string }> {
    const msg = await this.request<AmMessage>(
      "POST",
      `/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
      { to, subject, text: body.text, html: body.html },
    );
    return { messageId: msg.message_id };
  }

  /** GET /inboxes/{id}/messages — recent inbound (poll fallback to webhooks). */
  async listInbound(inboxId: string, limit = 10): Promise<InboundMessage[]> {
    const list = await this.request<AmMessageList>(
      "GET",
      `/inboxes/${encodeURIComponent(inboxId)}/messages?limit=${limit}`,
    );
    return list.messages.map((m) => ({
      messageId: m.message_id,
      threadId: m.thread_id,
      from: m.from ?? "",
      subject: m.subject,
      text: m.extracted_text ?? m.text ?? "",
    }));
  }

  /** POST /inboxes/{id}/messages/{messageId}/reply — reply in-thread. */
  async reply(
    inboxId: string,
    messageId: string,
    body: { text?: string; html?: string },
  ): Promise<{ messageId: string }> {
    const msg = await this.request<AmMessage>(
      "POST",
      `/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/reply`,
      { text: body.text, html: body.html },
    );
    return { messageId: msg.message_id };
  }
}

/**
 * Inbound webhook events (configure in the AgentMail console or via API):
 *   message.received | message.sent | message.delivered |
 *   message.bounced  | message.complained | message.rejected | domain.verified
 *
 * The agent's HTTP server should verify the webhook signature, then route a
 * `message.received` event into the autonomy loop (decide → act → reply).
 * Webhook signature verification mirrors the verify-then-act discipline of the
 * x402 layer: never act on an unverified inbound payload.
 */
export const AGENTMAIL_WEBHOOK_EVENTS = [
  "message.received",
  "message.sent",
  "message.delivered",
  "message.bounced",
  "message.complained",
  "message.rejected",
  "domain.verified",
] as const;
