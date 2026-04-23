/**
 * Team & Organization Routes
 * 
 * Week 3: Multi-user support for enterprise customers
 * - POST /api/v1/teams - Create team
 * - GET /api/v1/teams/:teamId - Get team info
 * - POST /api/v1/teams/:teamId/members - Add member
 * - DELETE /api/v1/teams/:teamId/members/:userId - Remove member
 * - GET /api/v1/teams/:teamId/usage - Team usage analytics
 */

import { Router } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import logger from '../utils/logger';
import * as phase4Store from '../db/phase4-store';

const router = Router();

// In-memory team store (replace with DB in production)
interface Team {
  id: string;
  name: string;
  ownerId: string;
  members: Array<{
    userId: string;
    role: 'owner' | 'admin' | 'member';
    joinedAt: Date;
  }>;
  settings: {
    maxMembers: number;
    requireApproval: boolean;
  };
  createdAt: Date;
}

const teams = new Map<string, Team>();
const userTeams = new Map<string, string[]>(); // userId -> teamIds

/**
 * POST /api/v1/teams
 * Create a new team/organization
 */
router.post(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const { name, maxMembers = 10 } = req.body;

      if (!name || name.length < 3) {
        return res.status(400).json({
          error: 'Invalid name',
          message: 'Team name must be at least 3 characters'
        });
      }

      // Create team
      const team: Team = {
        id: `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        ownerId: userId,
        members: [{
          userId,
          role: 'owner',
          joinedAt: new Date(),
        }],
        settings: {
          maxMembers,
          requireApproval: true,
        },
        createdAt: new Date(),
      };

      teams.set(team.id, team);

      // Add to user's teams
      const userTeamList = userTeams.get(userId) || [];
      userTeamList.push(team.id);
      userTeams.set(userId, userTeamList);

      logger.info({ userId: userId, teamId: team.id, name }, 'Team created');

      res.json({
        success: true,
        team: {
          id: team.id,
          name: team.name,
          ownerId: team.ownerId,
          memberCount: 1,
          maxMembers: team.settings.maxMembers,
          createdAt: team.createdAt,
        },
      });
    } catch (error) {
      logger.error({ error, userId: req.userId }, 'Team creation failed');
      res.status(500).json({ error: 'Failed to create team' });
    }
  }
);

/**
 * GET /api/v1/teams
 * List teams for authenticated user
 */
router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const teamIds = userTeams.get(userId) || [];

      const userTeamsList = teamIds
        .map(id => teams.get(id))
        .filter(Boolean)
        .map((team: any) => ({
          id: team.id,
          name: team.name,
          role: team.members.find((m: any) => m.userId === userId)?.role,
          memberCount: team.members.length,
          maxMembers: team.settings.maxMembers,
          createdAt: team.createdAt,
        }));

      res.json({
        success: true,
        teams: userTeamsList,
      });
    } catch (error) {
      logger.error({ error, userId: req.userId }, 'Team listing failed');
      res.status(500).json({ error: 'Failed to list teams' });
    }
  }
);

/**
 * GET /api/v1/teams/:teamId
 * Get team details
 */
router.get(
  '/:teamId',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { teamId } = req.params;
      const userId = req.userId!;

      const team = teams.get(teamId);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Check membership
      const membership = team.members.find(m => m.userId === userId);
      if (!membership) {
        return res.status(403).json({ error: 'Not a team member' });
      }

      // Get member details
      const members = team.members.map(m => {
        const user = phase4Store.getUserById(m.userId);
        return {
          userId: m.userId,
          role: m.role,
          wallet: user?.walletAddress,
          joinedAt: m.joinedAt,
        };
      });

      res.json({
        success: true,
        team: {
          id: team.id,
          name: team.name,
          ownerId: team.ownerId,
          settings: team.settings,
          members,
          createdAt: team.createdAt,
        },
        myRole: membership.role,
      });
    } catch (error) {
      logger.error({ error: error, teamId: req.params.teamId }, 'Team fetch failed');
      res.status(500).json({ error: 'Failed to fetch team' });
    }
  }
);

/**
 * POST /api/v1/teams/:teamId/members
 * Add member to team (owner/admin only)
 */
router.post(
  '/:teamId/members',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const { teamId } = req.params;
    try {
      const userId = req.userId!;
      const { walletAddress, role = 'member' } = req.body;

      const team = teams.get(teamId);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Check permissions
      const myRole = team.members.find(m => m.userId === userId)?.role;
      if (!myRole || !['owner', 'admin'].includes(myRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // Check capacity
      if (team.members.length >= team.settings.maxMembers) {
        return res.status(400).json({ error: 'Team is at max capacity' });
      }

      // Find user by wallet
      const userToAdd = phase4Store.getUserByWallet(walletAddress);
      if (!userToAdd) {
        return res.status(404).json({
          error: 'User not found',
          message: 'User must authenticate with this wallet first'
        });
      }

      // Check if already member
      if (team.members.find(m => m.userId === userToAdd.id)) {
        return res.status(400).json({ error: 'Already a team member' });
      }

      // Add member
      team.members.push({
        userId: userToAdd.id,
        role,
        joinedAt: new Date(),
      });

      // Update user's teams
      const userTeamList = userTeams.get(userToAdd.id) || [];
      userTeamList.push(teamId);
      userTeams.set(userToAdd.id, userTeamList);

      logger.info({
        teamId: teamId,
        addedBy: userId,
        newMember: userToAdd.id,
        role: role
      }, 'Team member added');

      res.json({
        success: true,
        member: {
          userId: userToAdd.id,
          wallet: userToAdd.walletAddress,
          role,
          joinedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error({ error, teamId }, 'Member add failed');
      res.status(500).json({ error: 'Failed to add member' });
    }
  }
);

/**
 * DELETE /api/v1/teams/:teamId/members/:memberUserId
 * Remove member from team
 */
router.delete(
  '/:teamId/members/:memberUserId',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { teamId, memberUserId } = req.params;
      const userId = req.userId!;

      const team = teams.get(teamId);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Check permissions (owner can remove anyone, admin can remove members)
      const myRole = team.members.find(m => m.userId === userId)?.role;
      const targetMember = team.members.find(m => m.userId === memberUserId);

      if (!targetMember) {
        return res.status(404).json({ error: 'Member not found' });
      }

      // Can't remove owner
      if (targetMember.role === 'owner') {
        return res.status(403).json({ error: 'Cannot remove team owner' });
      }

      // Permission checks
      if (userId !== memberUserId && !['owner', 'admin'].includes(myRole || '')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // Remove member
      team.members = team.members.filter(m => m.userId !== memberUserId);

      // Update user's teams
      const userTeamList = userTeams.get(memberUserId) || [];
      userTeams.set(memberUserId, userTeamList.filter(id => id !== teamId));

      logger.info({ teamId, removedBy: userId, memberId: memberUserId }, 'Team member removed');

      res.json({ success: true, message: 'Member removed' });
    } catch (error) {
      logger.error({ error: error, teamId: req.params.teamId }, 'Member removal failed');
      res.status(500).json({ error: 'Failed to remove member' });
    }
  }
);

/**
 * GET /api/v1/teams/:teamId/usage
 * Get team usage analytics
 */
router.get(
  '/:teamId/usage',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { teamId } = req.params;
      const userId = req.userId!;
      const { period = '30d' } = req.query;

      const team = teams.get(teamId);
      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Check membership
      if (!team.members.find(m => m.userId === userId)) {
        return res.status(403).json({ error: 'Not a team member' });
      }

      // Get all member transactions
      const days = parseInt(period as string) || 30;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const memberIds = team.members.map(m => m.userId);
      const transactions = Array.from((phase4Store as any).transactions?.values() || [])
        .filter((t: any) => memberIds.includes(t.userId) && t.createdAt >= startDate);

      // Aggregate by member
      const byMember: Record<string, { count: number; herdAmount: number; spent: number }> = {};
      transactions.forEach((t: any) => {
        if (!byMember[t.userId]) {
          byMember[t.userId] = { count: 0, herdAmount: 0, spent: 0 };
        }
        byMember[t.userId].count++;
        byMember[t.userId].herdAmount += t.herdAmount || 0;
        byMember[t.userId].spent += t.inputAmount || 0;
      });

      res.json({
        success: true,
        teamId,
        period: `${days}d`,
        summary: {
          totalTransactions: transactions.length,
          totalHerdAmount: transactions.reduce((sum: number, t: any) => sum + (t.herdAmount || 0), 0),
          totalSpent: transactions.reduce((sum: number, t: any) => sum + (t.inputAmount || 0), 0),
        },
        byMember: Object.entries(byMember).map(([userId, data]) => {
          const user = phase4Store.getUserById(userId);
          return {
            userId,
            wallet: user?.walletAddress,
            ...data,
          };
        }),
      });
    } catch (error) {
      logger.error({ error: error, teamId: req.params.teamId }, 'Team usage fetch failed');
      res.status(500).json({ error: 'Failed to fetch team usage' });
    }
  }
);

export default router;