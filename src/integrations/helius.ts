import axios from 'axios';
import { logger } from '../utils/logger';

interface PriceData {
  sol: number;
  timestamp: number;
}

let cachedPrice: PriceData | null = null;
const CACHE_DURATION_MS = 30 * 1000; // 30 seconds

export async function getSOLPrice(): Promise<number> {
  try {
    // Return cached price if fresh
    if (cachedPrice && Date.now() - cachedPrice.timestamp < CACHE_DURATION_MS) {
      logger.debug({ cached: true, price: cachedPrice.sol }, 'SOL price (from cache)');
      return cachedPrice.sol;
    }

    // For now, return a mock price since we may not have Helius API key
    // In production, this would call Helius /prices endpoint
    const mockPrice = 180.50; // $180.50 per SOL
    
    cachedPrice = {
      sol: mockPrice,
      timestamp: Date.now(),
    };

    logger.debug({ price: mockPrice }, 'SOL price fetched');
    return mockPrice;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch SOL price');
    // Fallback price
    return 180.0;
  }
}

export async function getHERDPrice(): Promise<number> {
  try {
    // Mock HERD price for demo
    const mockPrice = 0.25; // $0.25 per HERD
    logger.debug({ price: mockPrice }, 'HERD price fetched');
    return mockPrice;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch HERD price');
    return 0.25;
  }
}

export async function convertSOLToUSD(solAmount: number): Promise<number> {
  const solPrice = await getSOLPrice();
  return solAmount * solPrice;
}

export async function convertHERDToUSD(herdAmount: number): Promise<number> {
  const herdPrice = await getHERDPrice();
  return herdAmount * herdPrice;
}
