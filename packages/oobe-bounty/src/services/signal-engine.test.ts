import { describe, expect, it } from 'vitest';
import {
  generatePortfolioSignal,
  generatePriceMonitorSignal,
  generateSentimentSignal,
} from './signal-engine.js';

describe('signal-engine', () => {
  it('generates deterministic price signals for the same payload', async () => {
    const payload = {
      price: 106,
      previousPrice: 100,
      timestamp: '2026-05-21T12:00:00Z',
    };

    await expect(generatePriceMonitorSignal(payload)).resolves.toEqual(
      await generatePriceMonitorSignal(payload),
    );
  });

  it('maps price momentum to buy and sell actions', async () => {
    await expect(generatePriceMonitorSignal({
      price: 106,
      previousPrice: 100,
      timestamp: '2026-05-21T12:00:00Z',
    })).resolves.toMatchObject({ action: 'BUY', risk_level: 'MEDIUM' });

    await expect(generatePriceMonitorSignal({
      price: 94,
      previousPrice: 100,
      timestamp: '2026-05-21T12:00:00Z',
    })).resolves.toMatchObject({ action: 'SELL', risk_level: 'MEDIUM' });
  });

  it('uses standardized service metadata across all agents', async () => {
    await expect(generatePortfolioSignal({
      price: 170,
      trendScore: 0.4,
      riskScore: 0.3,
      solExposure: 0.5,
      timestamp: '2026-05-21T12:00:00Z',
    })).resolves.toMatchObject({
      agentId: 'portfolio-analyzer',
      service: 'analytics',
      action: 'BUY',
    });

    await expect(generateSentimentSignal({
      price: 170,
      sentimentScore: -0.5,
      mentionDelta: -10,
      timestamp: '2026-05-21T12:00:00Z',
    })).resolves.toMatchObject({
      agentId: 'sentiment-monitor',
      service: 'sentiment',
      action: 'SELL',
    });
  });
});

