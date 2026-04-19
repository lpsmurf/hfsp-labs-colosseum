/**
 * Monitoring & Alerting Routes
 * 
 * Week 3: System health monitoring and alerts
 * - GET /api/v1/monitoring/health - System health status
 * - GET /api/v1/monitoring/metrics - Key metrics
 * - GET /api/v1/monitoring/alerts - Active alerts
 * - POST /api/v1/monitoring/alerts - Create alert rule
 */

import { Router } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import * as phase4Store from '../db/phase4-store';

const router = Router();

// In-memory alert store (use Redis in production)
interface Alert {
  id: string;
  type: 'error_rate' | 'latency' | 'payment_failure' | 'credit_low';
  threshold: number;
  currentValue: number;
  status: 'active' | 'resolved';
  createdAt: Date;
  resolvedAt?: Date;
}

const alerts: Alert[] = [];

/**
 * GET /api/v1/monitoring/health
 * System health check
 */
router.get('/health', async (req, res) => {
  try {
    const stats = phase4Store.getStoreStats();
    
    // Check system health
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: stats.users > 0 ? 'healthy' : 'degraded',
        api: 'healthy',
        webhooks: 'healthy',
      },
      stats: {
        users: stats.users,
        activeQuotes: stats.quotes,
        transactions: stats.transactions,
        webhookEvents: stats.webhookEvents,
      },
    };

    // Determine overall status
    const services = Object.values(health.services);
    if (services.includes('down')) {
      health.status = 'critical';
    } else if (services.includes('degraded')) {
      health.status = 'warning';
    }

    res.json({ success: true, health });
  } catch (error) {
    logger.error({ error: error }, 'Health check failed');
    res.status(500).json({ error: 'Health check failed' });
  }
});

/**
 * GET /api/v1/monitoring/metrics
 * Key system metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    const hours = parseInt(period as string) || 24;
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Calculate metrics
    const transactions = Array.from((phase4Store as any).transactions?.values() || [])
      .filter((t: any) => t.createdAt >= startTime);

    const confirmed = transactions.filter((t: any) => t.status === 'confirmed');
    const failed = transactions.filter((t: any) => t.status === 'failed');

    const metrics = {
      period: `${hours}h`,
      transactions: {
        total: transactions.length,
        confirmed: confirmed.length,
        failed: failed.length,
        successRate: transactions.length > 0 
          ? ((confirmed.length / transactions.length) * 100).toFixed(2) + '%'
          : '0%',
      },
      revenue: {
        total: confirmed.reduce((sum: number, t: any) => sum + (t.inputAmount || 0), 0),
        byToken: {} as Record<string, number>,
      },
      performance: {
        averageConfirmationTime: '2.3s', // Mock value
        errorRate: transactions.length > 0 
          ? ((failed.length / transactions.length) * 100).toFixed(2) + '%'
          : '0%',
      },
    };

    // Aggregate by token
    confirmed.forEach((t: any) => {
      const token = t.inputToken || 'SOL';
      metrics.revenue.byToken[token] = (metrics.revenue.byToken[token] || 0) + (t.inputAmount || 0);
    });

    res.json({ success: true, metrics });
  } catch (error) {
    logger.error({ error: error }, 'Metrics fetch failed');
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

/**
 * GET /api/v1/monitoring/alerts
 * Get active alerts
 */
router.get('/alerts', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const activeAlerts = alerts.filter(a => a.status === 'active');
    
    res.json({
      success: true,
      alerts: activeAlerts,
      count: activeAlerts.length,
    });
  } catch (error) {
    logger.error({ error: error }, 'Alerts fetch failed');
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

/**
 * POST /api/v1/monitoring/check
 * Run health checks and generate alerts
 */
router.post('/check', async (req, res) => {
  try {
    const newAlerts: Alert[] = [];

    // Check error rate
    const transactions = Array.from((phase4Store as any).transactions?.values() || []);
    const recentTx = transactions.filter((t: any) => 
      t.createdAt > new Date(Date.now() - 60 * 60 * 1000)
    );
    
    if (recentTx.length > 0) {
      const failedCount = recentTx.filter((t: any) => t.status === 'failed').length;
      const errorRate = failedCount / recentTx.length;
      
      if (errorRate > 0.1) { // 10% error threshold
        newAlerts.push({
          id: `alert_${Date.now()}`,
          type: 'error_rate',
          threshold: 0.1,
          currentValue: errorRate,
          status: 'active',
          createdAt: new Date(),
        });
      }
    }

    // Add to alerts
    alerts.push(...newAlerts);

    // Cleanup old alerts
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (let i = alerts.length - 1; i >= 0; i--) {
      if (alerts[i].createdAt < cutoff) {
        alerts.splice(i, 1);
      }
    }

    res.json({
      success: true,
      checked: true,
      newAlerts: newAlerts.length,
      totalAlerts: alerts.filter(a => a.status === 'active').length,
    });
  } catch (error) {
    logger.error({ error: error }, 'Health check failed');
    res.status(500).json({ error: 'Check failed' });
  }
});

export default router;
