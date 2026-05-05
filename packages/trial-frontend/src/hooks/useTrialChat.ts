import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const TRIAL_LIMIT = 10;
const SESSION_ID_KEY = 'clawdrop_trial_session_id';
const MESSAGE_COUNT_KEY = 'clawdrop_trial_message_count';

type StreamRecord = Record<string, unknown>;

export type TrialRole = 'user' | 'assistant';
export type TrialToolStatus = 'pending' | 'running' | 'complete' | 'error';
export type TrialMessageStatus = 'streaming' | 'complete' | 'error';
export type TrialErrorType = 'network' | 'rate_limit' | 'server' | 'quota';

export interface TrialToolCall {
  id: string;
  name: string;
  input?: unknown;
  result?: unknown;
  status: TrialToolStatus;
  error?: string;
  createdAt: number;
}

export interface TrialMessage {
  id: string;
  role: TrialRole;
  content: string;
  createdAt: number;
  status?: TrialMessageStatus;
  toolCalls?: TrialToolCall[];
}

export interface TrialQuota {
  used: number;
  limit: number;
  remaining: number;
  resetsAt?: string;
}

export interface TrialChatError {
  type: TrialErrorType;
  message: string;
  status?: number;
}

export interface UseTrialChatReturn {
  messages: TrialMessage[];
  quota: TrialQuota;
  error: TrialChatError | null;
  isStreaming: boolean;
  shouldShowPaywall: boolean;
  sessionId: string;
  sendMessage: (message: string) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  clearError: () => void;
  dismissPaywall: () => void;
  stopStreaming: () => void;
}

class StreamFailure extends Error {
  status?: number;
  rateLimited?: boolean;

  constructor(message: string, status?: number, rateLimited = false) {
    super(message);
    this.name = 'StreamFailure';
    this.status = status;
    this.rateLimited = rateLimited;
  }
}

function getEnvValue(key: string): string | undefined {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env;
  const value = env?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getDefaultEndpoint(): string {
  const explicit = getEnvValue('VITE_TRIAL_CHAT_URL');
  if (explicit) return explicit;

  const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env;
  return env?.DEV ? 'http://localhost:8787/api/chat' : '/api/chat';
}

function createId(prefix: string) {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function readSessionValue(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionValue(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Private browsing can reject storage. The chat still works for this tab.
  }
}

function getOrCreateSessionId() {
  if (typeof window === 'undefined') return createId('trial-session');
  const existing = readSessionValue(SESSION_ID_KEY);
  if (existing) return existing;

  const sessionId = createId('trial-session');
  writeSessionValue(SESSION_ID_KEY, sessionId);
  return sessionId;
}

function getInitialQuota(): TrialQuota {
  if (typeof window === 'undefined') {
    return { used: 0, limit: TRIAL_LIMIT, remaining: TRIAL_LIMIT };
  }

  const stored = Number.parseInt(readSessionValue(MESSAGE_COUNT_KEY) ?? '0', 10);
  const used = Number.isFinite(stored) ? Math.min(Math.max(stored, 0), TRIAL_LIMIT) : 0;
  return { used, limit: TRIAL_LIMIT, remaining: Math.max(TRIAL_LIMIT - used, 0) };
}

function persistQuota(quota: TrialQuota) {
  writeSessionValue(MESSAGE_COUNT_KEY, String(quota.used));
}

function isRecord(value: unknown): value is StreamRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(record: StreamRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function getNumber(record: StreamRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function getPayloadRecord(payload: StreamRecord, keys: string[]): StreamRecord | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (isRecord(value)) return value;
  }
  return undefined;
}

function parseJson(data: string): StreamRecord | string {
  try {
    const parsed = JSON.parse(data) as unknown;
    return isRecord(parsed) ? parsed : data;
  } catch {
    return data;
  }
}

function parseSseFrame(frame: string): { eventName: string; data: StreamRecord | string } | null {
  const lines = frame.split(/\r?\n/);
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim() || 'message';
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }

  const data = dataLines.length > 0 ? dataLines.join('\n') : frame.trim();
  if (!data) return null;
  return { eventName, data: parseJson(data) };
}

function quotaFromPayload(payload: StreamRecord): TrialQuota | null {
  const quotaRecord = getPayloadRecord(payload, ['quota', 'usage']) ?? payload;
  const limit = getNumber(quotaRecord, ['limit', 'messageLimit', 'messages_per_day']) ?? TRIAL_LIMIT;
  const used = getNumber(quotaRecord, ['used', 'messagesUsed', 'count']);
  const remaining = getNumber(quotaRecord, ['remaining', 'messagesRemaining']);
  const resetsAt = getString(quotaRecord, ['resetsAt', 'reset_at', 'resetAt']);

  if (used === undefined && remaining === undefined) return null;

  const nextUsed = used ?? Math.max(limit - (remaining ?? limit), 0);
  return {
    used: Math.min(Math.max(nextUsed, 0), limit),
    limit,
    remaining: Math.max(remaining ?? limit - nextUsed, 0),
    resetsAt,
  };
}

function eventKind(eventName: string, payload: StreamRecord | string): string {
  if (isRecord(payload)) {
    return (
      getString(payload, ['type', 'event', 'kind']) ??
      eventName
    ).toLowerCase();
  }
  return eventName.toLowerCase();
}

function upsertToolCall(
  toolCalls: TrialToolCall[] | undefined,
  patch: Partial<TrialToolCall> & { id: string; name: string },
): TrialToolCall[] {
  const existing = toolCalls ?? [];
  const index = existing.findIndex((toolCall) => toolCall.id === patch.id);
  if (index === -1) {
    return [
      ...existing,
      {
        id: patch.id,
        name: patch.name,
        input: patch.input,
        result: patch.result,
        status: patch.status ?? 'pending',
        error: patch.error,
        createdAt: Date.now(),
      },
    ];
  }

  return existing.map((toolCall, currentIndex) =>
    currentIndex === index
      ? {
          ...toolCall,
          ...patch,
          input: patch.input ?? toolCall.input,
          result: patch.result ?? toolCall.result,
          error: patch.error ?? toolCall.error,
        }
      : toolCall,
  );
}

function buildToolPatch(payload: StreamRecord, fallbackName: string): Partial<TrialToolCall> & { id: string; name: string } {
  const nestedTool = getPayloadRecord(payload, ['toolCall', 'tool', 'call']);
  const source = nestedTool ?? payload;
  const name = getString(source, ['name', 'toolName', 'tool_name', 'id']) ?? fallbackName;
  const id = getString(source, ['toolCallId', 'tool_call_id', 'callId', 'id']) ?? `${name}-${Date.now()}`;
  const input = source.input ?? source.args ?? source.arguments ?? source.params;
  const result = source.result ?? source.output ?? payload.result ?? payload.output;
  const error = getString(source, ['error', 'message']);
  return { id, name, input, result, error };
}

function historyForPayload(messages: TrialMessage[]) {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-8)
    .map((message) => ({ role: message.role, content: message.content }));
}

export function useTrialChat(): UseTrialChatReturn {
  const endpoint = useMemo(getDefaultEndpoint, []);
  const [sessionId] = useState(getOrCreateSessionId);
  const [messages, setMessages] = useState<TrialMessage[]>([]);
  const [quota, setQuota] = useState<TrialQuota>(getInitialQuota);
  const [error, setError] = useState<TrialChatError | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [shouldShowPaywall, setShouldShowPaywall] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<TrialMessage[]>(messages);
  const lastPromptRef = useRef<string | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const applyQuota = useCallback((nextQuota: TrialQuota) => {
    setQuota(nextQuota);
    persistQuota(nextQuota);
    if (nextQuota.remaining <= 0) setShouldShowPaywall(true);
  }, []);

  const updateAssistant = useCallback((assistantId: string, updater: (message: TrialMessage) => TrialMessage) => {
    setMessages((current) =>
      current.map((message) => (message.id === assistantId ? updater(message) : message)),
    );
  }, []);

  const applyStreamEvent = useCallback(
    (eventName: string, data: StreamRecord | string, assistantId: string) => {
      if (data === '[DONE]') {
        updateAssistant(assistantId, (message) => ({ ...message, status: 'complete' }));
        return true;
      }

      if (typeof data === 'string') {
        updateAssistant(assistantId, (message) => ({ ...message, content: `${message.content}${data}` }));
        return false;
      }

      const nextQuota = quotaFromPayload(data);
      if (nextQuota) applyQuota(nextQuota);

      const kind = eventKind(eventName, data);
      if (kind.includes('done') || kind.includes('complete') || kind === 'message.stop') {
        updateAssistant(assistantId, (message) => ({ ...message, status: 'complete' }));
        return true;
      }

      if (kind.includes('error')) {
        const message = getString(data, ['message', 'error']) ?? 'Poly hit a snag. Try again.';
        updateAssistant(assistantId, (current) => ({
          ...current,
          status: 'error',
          content: current.content || message,
        }));
        setError({ type: 'server', message });
        return false;
      }

      if (kind.includes('quota') || kind.includes('limit') || kind === 'rate_limited') {
        const message = getString(data, ['message', 'error']) ?? 'You reached the free trial limit.';
        if (kind === 'rate_limited' || kind.includes('limit')) {
          setShouldShowPaywall(true);
          setError({ type: 'rate_limit', message, status: 429 });
        }
        return false;
      }

      if (kind.includes('tool')) {
        const patch = buildToolPatch(data, kind);
        const status: TrialToolStatus =
          kind.includes('result') || kind.includes('complete')
            ? 'complete'
            : kind.includes('error')
              ? 'error'
              : 'running';

        updateAssistant(assistantId, (message) => ({
          ...message,
          toolCalls: upsertToolCall(message.toolCalls, { ...patch, status }),
        }));
        return false;
      }

      const delta = getString(data, ['delta', 'token', 'text']);
      const content = getString(data, ['content', 'message']);
      const text = delta ?? content;
      if (text) {
        updateAssistant(assistantId, (message) => ({
          ...message,
          content: delta ? `${message.content}${delta}` : text,
        }));
      }

      return false;
    },
    [applyQuota, updateAssistant],
  );

  const streamResponse = useCallback(
    async (prompt: string, assistantId: string, userMessageId: string, retryAttempt: number) => {
      const controller = new AbortController();
      abortRef.current = controller;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: prompt,
          sessionId,
          clientMessageId: userMessageId,
          retryAttempt,
          messages: historyForPayload(messagesRef.current),
        }),
        signal: controller.signal,
      });

      if (response.status === 429) {
        const text = await response.text();
        let message = 'You reached the free trial limit.';
        const parsed = parseJson(text);
        if (isRecord(parsed)) message = getString(parsed, ['message', 'error']) ?? message;
        throw new StreamFailure(message, 429, true);
      }

      if (!response.ok) {
        throw new StreamFailure(`Poly is temporarily unavailable (${response.status}).`, response.status);
      }

      if (!response.body) {
        throw new StreamFailure('The server did not return a stream.', response.status);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;

      while (!completed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\n\n|\r\n\r\n/);
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const parsed = parseSseFrame(frame);
          if (!parsed) continue;
          completed = applyStreamEvent(parsed.eventName, parsed.data, assistantId);
          if (completed) break;
        }
      }

      const tail = buffer.trim();
      if (!completed && tail) {
        const parsed = parseSseFrame(tail);
        if (parsed) completed = applyStreamEvent(parsed.eventName, parsed.data, assistantId);
      }

      updateAssistant(assistantId, (message) => ({
        ...message,
        status: message.status === 'error' ? 'error' : 'complete',
      }));
    },
    [applyStreamEvent, endpoint, sessionId, updateAssistant],
  );

  const sendMessage = useCallback(
    async (rawMessage: string) => {
      const prompt = rawMessage.trim();
      if (!prompt || isStreaming) return;

      if (quota.remaining <= 0) {
        setShouldShowPaywall(true);
        setError({ type: 'quota', message: 'You have used today\'s 10 free messages.' });
        return;
      }

      lastPromptRef.current = prompt;
      setError(null);
      setShouldShowPaywall(false);
      setIsStreaming(true);

      const userMessage: TrialMessage = {
        id: createId('user'),
        role: 'user',
        content: prompt,
        createdAt: Date.now(),
        status: 'complete',
      };
      const assistantMessage: TrialMessage = {
        id: createId('assistant'),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        status: 'streaming',
        toolCalls: [],
      };

      setMessages((current) => [...current, userMessage, assistantMessage]);

      applyQuota({
        ...quota,
        used: Math.min(quota.used + 1, quota.limit),
        remaining: Math.max(quota.remaining - 1, 0),
      });

      let attempt = 0;
      const maxAttempts = 3;

      try {
        while (attempt < maxAttempts) {
          try {
            await streamResponse(prompt, assistantMessage.id, userMessage.id, attempt);
            return;
          } catch (streamError) {
            if (streamError instanceof DOMException && streamError.name === 'AbortError') return;
            if (streamError instanceof StreamFailure && streamError.rateLimited) throw streamError;
            attempt += 1;
            if (attempt >= maxAttempts) throw streamError;

            updateAssistant(assistantMessage.id, (message) => ({
              ...message,
              content: message.content || 'Reconnecting to Poly...',
              status: 'streaming',
            }));
            await new Promise((resolve) => window.setTimeout(resolve, 400 * attempt));
          }
        }
      } catch (sendError) {
        const status = sendError instanceof StreamFailure ? sendError.status : undefined;
        const rateLimited = sendError instanceof StreamFailure && sendError.rateLimited;
        const message =
          sendError instanceof Error
            ? sendError.message
            : 'The network dropped before Poly could answer.';

        setError({
          type: rateLimited ? 'rate_limit' : status && status >= 500 ? 'server' : 'network',
          message,
          status,
        });
        if (rateLimited || status === 429) setShouldShowPaywall(true);
        updateAssistant(assistantMessage.id, (current) => ({
          ...current,
          status: 'error',
          content: current.content || message,
        }));
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [applyQuota, isStreaming, quota, streamResponse, updateAssistant],
  );

  const retryLastMessage = useCallback(async () => {
    if (!lastPromptRef.current) return;
    await sendMessage(lastPromptRef.current);
  }, [sendMessage]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const dismissPaywall = useCallback(() => setShouldShowPaywall(false), []);

  return {
    messages,
    quota,
    error,
    isStreaming,
    shouldShowPaywall,
    sessionId,
    sendMessage,
    retryLastMessage,
    clearError,
    dismissPaywall,
    stopStreaming,
  };
}

export default useTrialChat;
