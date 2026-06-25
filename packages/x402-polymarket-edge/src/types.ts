// ── Polymarket market (from Gamma) ───────────────────────────────────────────
export interface MarketOutcome {
  label:   string;   // "Yes" / team name
  tokenId: string;   // CLOB token id (ERC-1155 position)
}

export interface PolyMarket {
  id:        string;
  slug:      string;
  question:  string;
  endDate:   string;
  liquidity: number;
  volume:    number;
  outcomes:  MarketOutcome[];
  url:       string;
}

// ── Sharp fixture (from oddspapi) ─────────────────────────────────────────────
export interface ProviderFixture {
  fixtureId:    string;
  sport:        string;
  participant1: string;
  participant2: string;
  startTime:    string;
}

export interface MatchedMarket {
  market:          PolyMarket;
  fixtureId:       string;
  matchConfidence: number;   // 0..1
}

// ── Fair value (after de-vig) ────────────────────────────────────────────────
export interface FairValue {
  tokenId:    string;
  pFair:      number;   // no-vig fair probability 0..1
  confidence: number;   // 0..1
}

// ── Live book (from CLOB) ────────────────────────────────────────────────────
export interface OrderBook {
  tokenId: string;
  bestBid: number | null;
  bestAsk: number | null;
  spread:  number | null;
}

// ── The product output: a ranked edge signal ─────────────────────────────────
export interface EdgeSignal {
  marketId:        string;
  question:        string;
  url:             string;
  outcomeLabel:    string;
  tokenId:         string;
  entryPrice:      number;   // best ask you'd pay
  pFair:           number;   // sharp no-vig fair probability
  rawEdge:         number;   // pFair - entryPrice
  netEdge:         number;   // rawEdge - cost buffer
  kellyStakeUsd:   number;   // fractional-Kelly stake at configured bankroll
  kellyShares:     number;
  matchConfidence: number;
  fairConfidence:  number;
  endDate:         string;
  ts:              number;
}

// ── Paper trading (CLV validation gate) ──────────────────────────────────────
export interface PaperPosition {
  id:           string;   // marketId:tokenId:openedPeriodTs
  marketId:     string;
  tokenId:      string;
  question:     string;
  outcomeLabel: string;
  entryPrice:   number;   // pessimistic fill (best ask + slippage)
  pFair:        number;
  netEdge:      number;
  stakeUsd:     number;
  shares:       number;
  openedAt:     string;   // ISO
  endDate:      string;
  status:       "open" | "won" | "lost" | "void";
  lastMid?:     number;   // last observed CLOB mid before resolution (closing-line proxy)
  closingPrice?: number;  // Polymarket price at/near resolution
  clvPct?:      number;   // closingPrice vs entryPrice
  pnlUsd?:      number;
  settledAt?:   string;
}

export interface CLVReport {
  total:        number;
  open:         number;
  settled:      number;
  wins:         number;
  losses:       number;
  voids:        number;
  winRatePct:   number;
  avgClvPct:    number;   // THE headline metric — positive = real edge
  totalStaked:  number;
  totalPnlUsd:  number;
  roiPct:       number;
  verdict:      string;
}
