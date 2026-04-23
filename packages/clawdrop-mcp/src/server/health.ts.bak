// STREAM 3: Health Checks (Kimi - Task 3.2)
// Service health checks for HFSP, Solana RPC, and Database

import axios from 'axios';
import Database from 'better-sqlite3';
import { log } from '../utils/logger';

const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds

/**
 * Check HFSP API health
 * GET HFSP_API_URL + '/health', timeout 5s
 */
export async function checkHFSPHealth(): Promise<boolean> {
  try {
    const hfspUrl = process.env.HFSP_URL || 'http://localhost:3001';
    const response = await axios.get(`${hfspUrl}/health`, {
      timeout: HEALTH_CHECK_TIMEOUT,
    });
    
    const isHealthy = response.status === 200;
    log.info(
      { 
        service: 'HFSP',
        status: response.status,
        healthy: isHealthy,
      },
      'HFSP health check'
    );
    return isHealthy;
  } catch (error: any) {
    log.warn(
      {
        service: 'HFSP',
        error: error.message,
        code: error.code,
      },
      'HFSP health check failed'
    );
    return false;
  }
}

/**
 * Check Solana RPC health
 * POST SOLANA_RPC_URL with getHealth method
 */
export async function checkSolanaRPCHealth(): Promise<boolean> {
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const response = await axios.post(
      rpcUrl,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getHealth',
      },
      {
        timeout: HEALTH_CHECK_TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    // getHealth returns {"result": "ok"} or error
    const isHealthy = response.data.result === 'ok' && !response.data.error;
    log.info(
      {
        service: 'Solana RPC',
        status: response.status,
        rpc_health: response.data.result,
        healthy: isHealthy,
      },
      'Solana RPC health check'
    );
    return isHealthy;
  } catch (error: any) {
    log.warn(
      {
        service: 'Solana RPC',
        error: error.message,
        code: error.code,
      },
      'Solana RPC health check failed'
    );
    return false;
  }
}

/**
 * Check database health
 * Try to SELECT 1 from SQLite
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const dbPath = process.env.DB_PATH || './agents.db';
    const db = new Database(dbPath);
    
    // Execute a simple query
    const result = db.prepare('SELECT 1 as health').get();
    db.close();
    
    const isHealthy = result && (result as any).health === 1;
    log.info(
      {
        service: 'Database',
        healthy: isHealthy,
      },
      'Database health check'
    );
    return isHealthy;
  } catch (error: any) {
    log.warn(
      {
        service: 'Database',
        error: error.message,
      },
      'Database health check failed'
    );
    return false;
  }
}

/**
 * Get overall health status
 * Returns {healthy: bool, services: {hfsp, solana, database}}
 */
export async function getOverallHealth(): Promise<{
  healthy: boolean;
  services: {
    hfsp: boolean;
    solana: boolean;
    database: boolean;
  };
}> {
  const [hfsp, solana, database] = await Promise.all([
    checkHFSPHealth(),
    checkSolanaRPCHealth(),
    checkDatabaseHealth(),
  ]);

  const overall = {
    healthy: hfsp && solana && database,
    services: { hfsp, solana, database },
  };

  log.info(
    {
      overall_health: overall.healthy,
      services: overall.services,
    },
    'Overall health check complete'
  );

  return overall;
}
