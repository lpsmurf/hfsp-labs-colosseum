import { readFile } from 'fs/promises';
import { join } from 'path';
import { Service, ServiceSchema } from '../server/schemas';
import { logger } from '../utils/logger';

const SERVICES_PATH = join(process.cwd(), 'src', 'data', 'services.json');

export async function readServicesFromFile(): Promise<Service[]> {
  try {
    const data = await readFile(SERVICES_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    const services = parsed.map((s: any) => ServiceSchema.parse(s));
    logger.debug({ count: services.length }, 'Services loaded from file');
    return services;
  } catch (error) {
    logger.error({ error, path: SERVICES_PATH }, 'Failed to load services');
    throw error;
  }
}

export async function getServiceById(id: string): Promise<Service | null> {
  const services = await readServicesFromFile();
  return services.find(s => s.id === id) || null;
}
