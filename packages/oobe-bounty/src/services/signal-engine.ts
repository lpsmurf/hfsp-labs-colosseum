import type { TradingSignal } from '../types.js';

type SignalInput = Record<string, unknown>;

// --- search service (price-monitor) ---
// Input: Google SERP results with organic_results[], answer_box, etc.
// We extract a price from the search results and generate a directional signal.

export async function generatePriceMonitorSignal(serpData: SignalInput): Promise<TradingSignal> {
  const timestamp = new Date().toISOString();

  // Ace search.google returns organic_results with title/snippet
  const organic = Array.isArray(serpData.organic_results) ? serpData.organic_results : [];
  const snippets = organic
    .slice(0, 5)
    .map((r: unknown) => `${String((r as Record<string, unknown>).title ?? '')} ${String((r as Record<string, unknown>).snippet ?? '')}`)
    .join(' ');

  // Also check answer_box for direct price
  const answerBox = serpData.answer_box as Record<string, unknown> | undefined;
  const answerText = String(answerBox?.answer ?? answerBox?.snippet ?? '');

  const actualPrice = extractUsdPrice(answerText + ' ' + snippets) || numberFrom(serpData, ['price'], 0);
  const previousPrice = numberFrom(serpData, ['previousPrice', 'previous_price'], actualPrice);
  const changePct = previousPrice > 0 ? ((actualPrice - previousPrice) / previousPrice) * 100 : 0;

  // Sentiment keywords in SERP results
  const text = (snippets + answerText).toLowerCase();
  const bullishWords = (text.match(/\b(surges?|rallies|gains?|bullish|all.time.high|breakout|soars?)\b/g) ?? []).length;
  const bearishWords = (text.match(/\b(drops?|falls?|crash|bearish|sell.?off|decline|plunge)\b/g) ?? []).length;
  const sentimentBias = (bullishWords - bearishWords) / Math.max(1, bullishWords + bearishWords);

  const score = changePct / 5 + sentimentBias * 0.5;
  const action = score >= 0.3 ? 'BUY' : score <= -0.3 ? 'SELL' : 'HOLD';
  const confidence = clamp(0.52 + Math.min(Math.abs(score), 1.5) / 5, 0.5, 0.92);

  return {
    agentId: 'price-monitor',
    service: 'search',
    action,
    target_price: roundPrice(action === 'BUY' ? actualPrice * 1.05 : action === 'SELL' ? actualPrice * 0.95 : actualPrice),
    confidence: roundConfidence(confidence),
    reason: `SERP analysis: ${bullishWords} bullish / ${bearishWords} bearish signals. Price Δ ${changePct.toFixed(1)}%.`,
    risk_level: Math.abs(changePct) >= 8 ? 'HIGH' : Math.abs(changePct) >= 3 ? 'MEDIUM' : 'LOW',
    actual_price: roundPrice(actualPrice),
    timestamp,
  };
}

// --- chat service (portfolio-analyzer) ---
// Input: JSON from AI chat — { action, confidence, price, reason }
// The AI already produced a structured recommendation; we just validate and forward it.

export async function generatePortfolioSignal(chatData: SignalInput): Promise<TradingSignal> {
  const timestamp = new Date().toISOString();

  const raw = stringFrom(chatData, ['action']) ?? 'HOLD';
  const action = (['BUY', 'SELL', 'HOLD'] as const).find((a) => a === raw.toUpperCase()) ?? 'HOLD';
  const confidence = clamp(numberFrom(chatData, ['confidence'], 0.6), 0.5, 0.95);
  const price = numberFrom(chatData, ['price'], 0);
  const reason = String(chatData.reason ?? 'AI market analysis').slice(0, 200);

  return {
    agentId: 'portfolio-analyzer',
    service: 'chat',
    action,
    target_price: roundPrice(action === 'BUY' ? price * 1.04 : action === 'SELL' ? price * 0.96 : price),
    confidence: roundConfidence(confidence),
    reason,
    risk_level: confidence >= 0.8 ? 'HIGH' : confidence >= 0.65 ? 'MEDIUM' : 'LOW',
    actual_price: roundPrice(price),
    timestamp,
  };
}

// --- images service (sentiment-monitor) ---
// Input: { imageUrl, sentiment, price, timestamp }
// sentiment is a float [-1, +1] derived from the image prompt/context.

export async function generateSentimentSignal(imagesData: SignalInput): Promise<TradingSignal> {
  const timestamp = new Date().toISOString();
  const imageUrl = String(imagesData.imageUrl ?? '');
  const sentiment = clamp(numberFrom(imagesData, ['sentiment', 'sentimentScore'], 0), -1, 1);
  const price = numberFrom(imagesData, ['price', 'actual_price'], 0);

  const action = sentiment >= 0.3 ? 'BUY' : sentiment <= -0.3 ? 'SELL' : 'HOLD';
  const confidence = clamp(0.5 + Math.abs(sentiment) * 0.35, 0.5, 0.85);
  const chartRef = imageUrl ? ` Chart: ${imageUrl}` : '';

  return {
    agentId: 'sentiment-monitor',
    service: 'images',
    action,
    target_price: roundPrice(action === 'BUY' ? price * 1.05 : action === 'SELL' ? price * 0.95 : price),
    confidence: roundConfidence(confidence),
    reason: `Visual sentiment ${sentiment >= 0 ? 'bullish' : 'bearish'} (${(sentiment * 100).toFixed(0)}%).${chartRef}`,
    risk_level: Math.abs(sentiment) >= 0.7 ? 'HIGH' : Math.abs(sentiment) >= 0.3 ? 'MEDIUM' : 'LOW',
    actual_price: roundPrice(price),
    timestamp,
  };
}

// --- helpers ---

function extractUsdPrice(text: string): number {
  // Match patterns like "$175.50", "175.50 USD", "$175", "175 USD"
  const m = text.match(/\$\s?([\d,]+(?:\.\d+)?)\s?(?:USD)?/i)
    ?? text.match(/([\d,]+(?:\.\d+)?)\s?USD/i);
  if (!m) return 0;
  const parsed = Number.parseFloat(m[1].replace(/,/g, ''));
  // Plausible SOL price range: $1 – $10000
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 10_000 ? parsed : 0;
}

function numberFrom(input: SignalInput, keys: string[], fallback: number): number {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function stringFrom(input: SignalInput, keys: string[]): string | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundPrice(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(4));
}

function roundConfidence(value: number): number {
  return Number(value.toFixed(3));
}
