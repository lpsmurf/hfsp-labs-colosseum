import { readFileSync } from 'fs';
import { join } from 'path';
import { Tier, TierSchema } from '../models/tier';
import logger from '../utils/logger';

/**
 * Load tier catalog from tiers.json
 */
export async function readTiersFromFile(): Promise<Tier[]> {
  try {
    const dataPath = join(__dirname, '../data/tiers.json');
    const rawData = readFileSync(dataPath, 'utf-8');
    const parsedData = JSON.parse(rawData);
    
    // Validate and parse each tier
    const tiers = parsedData.map((tier: unknown) => TierSchema.parse(tier));
    
    logger.info({ count: tiers.length }, 'Tiers loaded from file');
    return tiers;
  } catch (error) {
    logger.error({ error }, 'Failed to read tiers from file');
    throw error;
  }
}

/**
 * Get a specific tier by ID
 */
export async function getTierById(tier_id: string): Promise<Tier | null> {
  try {
    const tiers = await readTiersFromFile();
    return tiers.find(t => t.id === tier_id) || null;
  } catch (error) {
    logger.error({ tier_id, error }, 'Failed to get tier');
    throw error;
  }
}

/**
 * Get tiers by category
 */
export async function getTiersByCategory(category: string): Promise<Tier[]> {
  try {
    const tiers = await readTiersFromFile();
    return tiers.filter(t => t.category === category);
  } catch (error) {
    logger.error({ category, error }, 'Failed to get tiers by category');
    throw error;
  }
}

/**
 * Get tiers by capability bundle
 */
export async function getTiersByBundle(capability_bundle: string): Promise<Tier[]> {
  try {
    const tiers = await readTiersFromFile();
    return tiers.filter(t => t.capability_bundle === capability_bundle);
  } catch (error) {
    logger.error({ capability_bundle, error }, 'Failed to get tiers by bundle');
    throw error;
  }
}
