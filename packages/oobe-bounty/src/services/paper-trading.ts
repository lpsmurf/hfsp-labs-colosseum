import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { PredictionMarket } from './prediction-markets.js';

export const PAPER_STAKE = 10; // virtual USD per bet

export interface PaperBet {
  id: string;
  market_id: string;
  source: string;
  question: string;
  predicted_outcome: string;
  entry_probability: number;
  stake: number;
  potential_payout: number;
  potential_profit: number;
  end_date: string;
  hours_at_bet: number;
  market_url: string;
  status: 'open' | 'won' | 'lost' | 'void';
  actual_outcome: string | null;
  actual_payout: number;
  created_at: string;
  resolved_at: string | null;
}

export interface PaperPnL {
  totalBets: number;
  openBets: number;
  won: number;
  lost: number;
  void: number;
  totalStaked: number;
  totalPayout: number;
  netProfit: number;
  winRate: number;
  potentialIfAllWin: number;
}

export function placePaperBet(db: Database, market: PredictionMarket): PaperBet | null {
  // Skip if already bet on this market
  const existing = db.prepare('SELECT id FROM paper_bets WHERE market_id = ?').get(market.id);
  if (existing) return null;

  const payout = PAPER_STAKE / market.probability;
  const profit = payout - PAPER_STAKE;

  const bet: PaperBet = {
    id: randomUUID(),
    market_id: market.id,
    source: market.source,
    question: market.question,
    predicted_outcome: market.predictedOutcome,
    entry_probability: market.probability,
    stake: PAPER_STAKE,
    potential_payout: Math.round(payout * 100) / 100,
    potential_profit: Math.round(profit * 100) / 100,
    end_date: market.endDate,
    hours_at_bet: market.hoursLeft,
    market_url: market.url,
    status: 'open',
    actual_outcome: null,
    actual_payout: 0,
    created_at: new Date().toISOString(),
    resolved_at: null,
  };

  db.prepare(`
    INSERT INTO paper_bets (
      id, market_id, source, question, predicted_outcome,
      entry_probability, stake, potential_payout, potential_profit,
      end_date, hours_at_bet, market_url, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(
    bet.id, bet.market_id, bet.source, bet.question, bet.predicted_outcome,
    bet.entry_probability, bet.stake, bet.potential_payout, bet.potential_profit,
    bet.end_date, bet.hours_at_bet, bet.market_url, bet.created_at,
  );

  return bet;
}

export function resolvePaperBet(
  db: Database,
  marketId: string,
  actualOutcome: string,
  won: boolean,
): PaperBet | null {
  const bet = db.prepare('SELECT * FROM paper_bets WHERE market_id = ? AND status = ?')
    .get(marketId, 'open') as PaperBet | undefined;
  if (!bet) return null;

  const actualPayout = won ? bet.potential_payout : 0;
  db.prepare(`
    UPDATE paper_bets
    SET status = ?, actual_outcome = ?, actual_payout = ?, resolved_at = datetime('now')
    WHERE market_id = ?
  `).run(won ? 'won' : 'lost', actualOutcome, actualPayout, marketId);

  return { ...bet, status: won ? 'won' : 'lost', actual_outcome: actualOutcome, actual_payout: actualPayout };
}

export function getOpenBets(db: Database): PaperBet[] {
  return db.prepare('SELECT * FROM paper_bets WHERE status = ? ORDER BY end_date ASC')
    .all('open') as PaperBet[];
}

export function getAllBets(db: Database, days = 3): PaperBet[] {
  return db.prepare(`
    SELECT * FROM paper_bets
    WHERE created_at >= datetime('now', ?)
    ORDER BY created_at DESC
  `).all(`-${days} days`) as PaperBet[];
}

export function getPnL(db: Database, days = 3): PaperPnL {
  const bets = getAllBets(db, days);
  const won    = bets.filter(b => b.status === 'won').length;
  const lost   = bets.filter(b => b.status === 'lost').length;
  const voided = bets.filter(b => b.status === 'void').length;
  const open   = bets.filter(b => b.status === 'open').length;

  const totalStaked  = bets.filter(b => b.status !== 'void').length * PAPER_STAKE;
  const totalPayout  = bets.filter(b => b.status === 'won').reduce((s, b) => s + b.actual_payout, 0);
  const netProfit    = totalPayout - totalStaked;
  const winRate      = (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) : 0;
  const potentialIfAllWin = bets
    .filter(b => b.status === 'open')
    .reduce((s, b) => s + b.potential_profit, 0);

  return {
    totalBets: bets.length, openBets: open, won, lost, void: voided,
    totalStaked: Math.round(totalStaked * 100) / 100,
    totalPayout: Math.round(totalPayout * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    winRate,
    potentialIfAllWin: Math.round(potentialIfAllWin * 100) / 100,
  };
}
