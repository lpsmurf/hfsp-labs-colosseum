/**
 * Health Check Routes
 * 
 * Provides endpoints for monitoring service health:
 * - /health - Overall service health
 * - /health/ready - Readiness probe (for Kubernetes)
 * - /health/live - Liveness probe (for Kubernetes)
 * - /health/dependencies - Dependency status (HFSP, Birdeye, etc.)
 */

import { Router } from 'express';
import logger from '../../utils/logger';
import { healthCheck as hfspHealthCheck } from '../../integrations/hfsp';
import axios from 'axios';

const router = Router();

// Service start time for uptime calculation
const startTime = Date.now();

/**
 * Basic health check
 * GET /health
 */
router.get('/', async (req, res) => {
  try {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime_seconds: uptime,
      version: process.env.npm_package_version || '0.2.0',
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (error) {
    logger.error({ error }, 'Health check failed');
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Readiness probe
 * Returns 200 when service is ready to accept traffic
 * GET /health/ready
 */
router.get('/ready', async (req, res) => {
  // Check critical dependencies
  const checks = await Promise.all([
    checkDatabase(),
    checkHFSP(),
  ]);
  
  const allReady = checks.every(c => c.healthy);
  
  if (allReady) {
    res.json({
      status: 'ready',
      checks: checks.reduce((acc, c) => ({ ...acc, [c.name]: c.status }), {}),
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      checks: checks.reduce((acc, c) => ({ ...acc, [c.name]: c.status }), {}),
    });
  }
});

/**
 * Liveness probe
 * Returns 200 if service is running (kubelet will restart if this fails)
 * GET /health/live
 */
router.get('/live', (req, res) => {
  // Simple liveness - just confirm we're not deadlocked
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Dependency health check
 * GET /health/dependencies
 */
router.get('/dependencies', async (req, res) => {
  const checks = await Promise.all([
    checkDatabase(),
    checkHFSP(),
    checkBirdeye(),
    checkDDXYZ(),
    checkJupiter(),
  ]);
  
  const allHealthy = checks.every(c => c.healthy);
  
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    dependencies: checks,
  });
});

// Health check functions
async function checkDatabase(): Promise<{ name: string; healthy: boolean; status: string; latency_ms?: number }> {
  try {
    const start = Date.now();
    // Simple check - verify we can access the data directory
    const fs = await import('fs');
    fs.accessSync(process.cwd());
    const latency = Date.now() - start;
    
    return {
      name: 'database',
      healthy: true,
      status: 'connected',
      latency_ms: latency,
    };
  } catch (error) {
    return {
      name: 'database',
      healthy: false,
      status: 'error',
    };
  }
}

async function checkHFSP(): Promise<{ name: string; healthy: boolean; status: string; latency_ms?: number }> {
  try {
    const start = Date.now();
    const healthy = await hfspHealthCheck();
    const latency = Date.now() - start;
    
    return {
      name: 'hfsp',
      healthy,
      status: healthy ? 'connected' : 'unreachable',
      latency_ms: latency,
    };
  } catch (error) {
    return {
      name: 'hfsp',
      healthy: false,
      status: 'error',
    };
  }
}

async function checkBirdeye(): Promise<{ name: string; healthy: boolean; status: string; latency_ms?: number }> {
  try {
    const start = Date.now();
    const apiKey = process.env.BIRDEYE_API_KEY;
    
    if (!apiKey) {
      return {
        name: 'birdeye',
        healthy: false,
        status: 'no_api_key',
      };
    }
    
    const response = await axios.get('https://public-api.birdeye.so/defi/token_trending?limit=1', {
      headers: { 'X-API-KEY': apiKey },
      timeout: 5000,
    });
    
    const latency = Date.now() - start;
    const healthy = response.status === 200;
    
    return {
      name: 'birdeye',
      healthy,
      status: healthy ? 'connected' : 'error',
      latency_ms: latency,
    };
  } catch (error) {
    return {
      name: 'birdeye',
      healthy: false,
      status: 'error',
    };
  }
}

async function checkDDXYZ(): Promise<{ name: string; healthy: boolean; status: string; latency_ms?: number }> {
  try {
    const start = Date.now();
    const apiKey = process.env.DD_XYZ_API_KEY;
    
    if (!apiKey) {
      return {
        name: 'dd_xyz',
        healthy: false,
        status: 'no_api_key',
      };
    }
    
    // DD.xyz doesn't have a simple health endpoint, so we just verify key exists
    const latency = Date.now() - start;
    
    return {
      name: 'dd_xyz',
      healthy: true,
      status: 'configured',
      latency_ms: latency,
    };
  } catch (error) {
    return {
      name: 'dd_xyz',
      healthy: false,
      status: 'error',
    };
  }
}

async function checkJupiter(): Promise<{ name: string; healthy: boolean; status: string; latency_ms?: number }> {
  try {
    const start = Date.now();
    const response = await axios.get('https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112', {
      timeout: 5000,
    });
    
    const latency = Date.now() - start;
    const healthy = response.status === 200;
    
    return {
      name: 'jupiter',
      healthy,
      status: healthy ? 'connected' : 'error',
      latency_ms: latency,
    };
  } catch (error) {
    return {
      name: 'jupiter',
      healthy: false,
      status: 'error',
    };
  }
}

export default router;
