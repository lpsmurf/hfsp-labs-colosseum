import type { Database } from 'better-sqlite3';
import { fetchPolymarketScreened, fetchKalshiScreened, hasBeenPosted } from '../services/prediction-markets.js';
import { placePaperBet } from '../services/paper-trading.js';
import { insertSignal, logAuditEvent, setAgentRunning } from '../db/migrations.js';
import { createAceClient } from '../services/ace-client.js';
import { extractX402Hash, recordX402Payment } from '../services/x402-payments.js';
import type { PredictionMarket } from '../services/prediction-markets.js';
import type { RunningAgent } from '../types.js';

const INTERVAL_MS = 60 * 60 * 1000;
const MIN_PROBABILITY = parseFloat(process.env.PREDICTION_MIN_PROBABILITY ?? '0.92');
const MAX_PROBABILITY = parseFloat(process.env.PREDICTION_MAX_PROBABILITY ?? '0.98');
// Show opportunities closing within 7 days; paper bets only placed on <24h markets
const MAX_HOURS_LEFT = parseFloat(process.env.PREDICTION_MAX_HOURS ?? '168');
// Markets closing within 12h get an urgent "closing soon" alert post
const URGENT_HOURS = 12;

export function startPredictionMarketsAgent(db: Database): RunningAgent {
  let running = true;
  setAgentRunning(db, 'prediction-markets-agent', true);

  const tick = async () => {
    if (!running) return;

    try {
      const kalshiKey = process.env.KALSHI_API_KEY ?? '';
      const [polyMarkets, kalshiMarkets] = await Promise.all([
        fetchPolymarketScreened(MIN_PROBABILITY, MAX_PROBABILITY, MAX_HOURS_LEFT),
        fetchKalshiScreened(kalshiKey, MIN_PROBABILITY, MAX_PROBABILITY, MAX_HOURS_LEFT),
      ]);

      const allMarkets = [...polyMarkets, ...kalshiMarkets]
        .sort((a, b) => a.hoursLeft - b.hoursLeft);

      if (allMarkets.length === 0) {
        logAuditEvent(db, 'prediction-markets-agent', 'no_markets_found', {
          minProbability: MIN_PROBABILITY,
          maxHoursLeft: MAX_HOURS_LEFT,
        });
        return;
      }

      let posted = 0;
      for (const market of allMarkets.slice(0, 5)) {
        if (hasBeenPosted(db, market.id)) continue;

        // LLM quality score + paper bet on markets closing within 24h (92-98% range)
        let score: LLMScore | undefined;
        if (market.hoursLeft <= 24 && market.probability >= 0.92 && market.probability <= 0.98) {
          score = await scorePredictionMarket(db, market);
          if (score.skip) {
            logAuditEvent(db, 'prediction-markets-agent', 'paper_bet_skipped_by_llm', {
              marketId: market.id,
              confidence: score.confidence,
              reasoning: score.reasoning,
            });
          } else {
            const bet = placePaperBet(db, market);
            if (bet) {
              logAuditEvent(db, 'prediction-markets-agent', 'paper_bet_placed', {
                marketId: market.id,
                question: market.question,
                probability: market.probability,
                llmConfidence: score.confidence,
                llmReasoning: score.reasoning,
                potentialPayout: bet.potential_payout,
                hoursLeft: market.hoursLeft,
              });
            }
          }
        }

        const isUrgent = market.hoursLeft <= URGENT_HOURS;
        // score is only defined when the 24h+92-98% condition was true above
        const reason = JSON.stringify({
          marketId: market.id,
          question: market.question,
          outcome: market.predictedOutcome,
          probability: market.probability,
          hoursLeft: market.hoursLeft,
          volume: market.volume,
          url: market.url,
          source: market.source,
          urgent: isUrgent,
          llmScore: typeof score !== 'undefined' ? score.confidence : undefined,
          llmReasoning: typeof score !== 'undefined' ? score.reasoning : undefined,
        });

        insertSignal(db, {
          agentId: 'prediction-markets-agent',
          service: 'search',
          action: 'BUY',
          symbol: 'PRED',
          target_price: market.probability,
          confidence: market.probability,
          reason,
          risk_level: 'LOW',
          actual_price: market.probability,
          timestamp: new Date().toISOString(),
        });

        posted++;
      }

      logAuditEvent(db, 'prediction-markets-agent', 'prediction_markets_screened', {
        found: allMarkets.length,
        posted,
        sources: { polymarket: polyMarkets.length, kalshi: kalshiMarkets.length },
      });

    } catch (error) {
      logAuditEvent(db, 'prediction-markets-agent', 'prediction_markets_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), INTERVAL_MS);

  return {
    agentId: 'prediction-markets-agent',
    running,
    stop: () => {
      running = false;
      clearInterval(timer);
      setAgentRunning(db, 'prediction-markets-agent', false);
    },
  };
}

interface LLMScore { confidence: number; reasoning: string; skip: boolean; }

async function scorePredictionMarket(db: Database, market: PredictionMarket): Promise<LLMScore> {
  try {
    const ace = createAceClient();
    const prompt = `You are a prediction market analyst. Assess whether this crowd probability is reliable.

Market: "${market.question}"
Predicted outcome: ${market.predictedOutcome}
Crowd probability: ${Math.round(market.probability * 100)}%
Volume traded: $${(market.volume / 1000).toFixed(0)}K
Closes in: ${market.hoursLeft} hours
Source: ${market.source}

Evaluate:
1. Is the resolution criteria clear and unambiguous?
2. Is this volume sufficient for a reliable signal (>$50K is good)?
3. Any plausible scenario where the crowd is wrong?
4. Is there adverse selection or manipulation risk?

Rate confidence 1-10 (10 = very safe bet). Skip if confidence < 7.
Reply ONLY with JSON: {"confidence":8,"reasoning":"one sentence max 100 chars","skip":false}`;

    const completion = await ace.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
    }) as Record<string, unknown>;

    const x402Hash = extractX402Hash(completion);
    recordX402Payment('prediction-markets-agent', 'chat', x402Hash, db);

    const choice = (completion.choices as Array<Record<string, unknown>>)?.[0];
    const raw = String((choice?.message as Record<string, unknown> | undefined)?.content ?? '{}');
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as Partial<LLMScore>;
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 7;

    return {
      confidence,
      reasoning: String(parsed.reasoning ?? 'No reasoning'),
      skip: parsed.skip === true || confidence < 7,
    };
  } catch {
    return { confidence: 7, reasoning: 'LLM unavailable — using crowd probability only', skip: false };
  }
}
