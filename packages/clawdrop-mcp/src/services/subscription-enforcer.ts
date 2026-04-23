/**
 * Subscription Enforcement Service
 *
 * Checks all deployed agents every hour.
 * Agents past their renewal date get a 48-hour grace period.
 * After grace period: calls HFSP to stop the container.
 */

import { listAgents, updateAgentStatus, getAgent } from '../db/memory';
import { stopViaHFSP } from '../integrations/hfsp';
import logger from '../utils/logger';

export interface EnforcementResult {
  checked: number;
  active: number;
  in_grace_period: number;
  stopped: number;
  errors: number;
}

const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000; // 48 hours in ms

/**
 * Run a single subscription enforcement pass over all agents.
 * - Agents with status 'running' are checked against next_payment_due.
 * - Overdue by < 48 h  → enter/extend grace period (no action on container).
 * - Overdue by >= 48 h → stopViaHFSP + mark 'stopped' in local DB.
 */
export async function runSubscriptionCheck(): Promise<EnforcementResult> {
  const result: EnforcementResult = {
    checked: 0,
    active: 0,
    in_grace_period: 0,
    stopped: 0,
    errors: 0,
  };

  logger.info('Running subscription enforcement check');

  const agents = listAgents();
  result.checked = agents.length;

  const now = Date.now();

  for (const agent of agents) {
    if (agent.status !== 'running') continue;
    result.active++;

    const nextDue = agent.subscription.next_payment_due.getTime();

    // Still within billing period — nothing to do
    if (now <= nextDue) continue;

    const overdueMs = now - nextDue;

    try {
      if (overdueMs < GRACE_PERIOD_MS) {
        // Within 48-hour grace window — record grace_period_end if not already set
        const gracePeriodEnd = new Date(nextDue + GRACE_PERIOD_MS);

        // Mutate via re-fetching so we have the live reference
        const live = getAgent(agent.agent_id);
        if (live && live.subscription.grace_period_end === null) {
          live.subscription.grace_period_end = gracePeriodEnd;
          // Trigger a status update so persistToDisk() is called
          updateAgentStatus(agent.agent_id, 'running');
          logger.warn(
            {
              agent_id: agent.agent_id,
              grace_period_end: gracePeriodEnd.toISOString(),
              overdue_hours: (overdueMs / 3_600_000).toFixed(1),
            },
            'Agent overdue — grace period set'
          );
        } else {
          logger.warn(
            {
              agent_id: agent.agent_id,
              grace_period_end: live?.subscription.grace_period_end?.toISOString(),
            },
            'Agent overdue — already in grace period'
          );
        }

        result.in_grace_period++;
      } else {
        // Past 48-hour grace window — stop the container
        logger.warn(
          {
            agent_id: agent.agent_id,
            overdue_hours: (overdueMs / 3_600_000).toFixed(1),
          },
          'Agent past grace period — stopping container'
        );

        await stopViaHFSP(agent.agent_id);
        updateAgentStatus(agent.agent_id, 'stopped');

        logger.info({ agent_id: agent.agent_id }, 'Agent stopped due to missed payment');
        result.stopped++;
      }
    } catch (err) {
      logger.error(
        { agent_id: agent.agent_id, error: err instanceof Error ? err.message : String(err) },
        'Error during subscription enforcement for agent'
      );
      result.errors++;
    }
  }

  logger.info(result, 'Subscription enforcement check complete');
  return result;
}

/**
 * Start the subscription enforcer on an interval.
 * Default: every hour (3 600 000 ms).
 * Returns the timer handle so the caller can cancel it with stopSubscriptionEnforcer().
 */
export function startSubscriptionEnforcer(intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
  // Run immediately on start, then on every interval tick
  runSubscriptionCheck().catch(err =>
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Initial subscription check failed')
  );

  const timer = setInterval(() => {
    runSubscriptionCheck().catch(err =>
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Periodic subscription check failed')
    );
  }, intervalMs);

  return timer;
}

/**
 * Stop the subscription enforcer by clearing its interval timer.
 */
export function stopSubscriptionEnforcer(timer: NodeJS.Timeout): void {
  clearInterval(timer);
  logger.info('Subscription enforcer stopped');
}
