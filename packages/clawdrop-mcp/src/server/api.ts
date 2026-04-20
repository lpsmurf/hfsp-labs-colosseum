import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { handleToolCall } from './tools';
import { ToolInputSchemas } from './schemas';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';
import { x402Middleware } from '../middleware/x402';
import paymentMiddleware from '../middleware/payment';
import transactionRouter from '../api/routes/transactions';

// Phase 4 Routes
import authRouter from './auth';
import paymentRouter from './payment';
import webhooksRouter from './webhooks';
import openRouterRouter from './openrouter';
import analyticsRouter from './analytics';
import teamsRouter from './teams';
import monitoringRouter from './monitoring';
import healthRouter from '../api/routes/health';
import { apiLimiter, strictLimiter } from '../middleware/rate-limit';

/**
 * Express HTTP API server for Clawdrop
 * 
 * Middleware Stack:
 * 1. CORS & JSON parsing
 * 2. Request logging
 * 3. x402 Payment Protocol (classifies transactions)
 * 4. Payment Pipeline (quotes, execution, fee collection)
 * 5. Route handlers (MCP tools & transaction APIs)
 * 6. Error handling
 * 
 * Architecture:
 * - Transaction routes flow through x402 → payment middleware → MemPalace
 * - Fee collection happens automatically on all transactions
 * - Multi-wing isolation: swap/flight/transfer keep separate conversation memory
 */

export class ClawdropAPIServer {
  private app: Express;
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));

    // Enable CORS for web frontend
    this.app.use(cors({
      origin: ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'],
      credentials: true,
    }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logger.info({ method: req.method, path: req.path }, 'HTTP request');
      next();
    });

    // ========================================================================
    // x402 Payment Protocol Middleware
    // ========================================================================
    // Classifies all transactions and attaches payment metadata
    this.app.use('/api/swap', x402Middleware);
    this.app.use('/api/transfer', x402Middleware);
    this.app.use('/api/booking', x402Middleware);
    
    logger.info({}, '[API_MIDDLEWARE_SETUP] x402 middleware attached to payment routes');
  }

  private setupRoutes(): void {
    // ===================================================================
    // Phase 4 Week 1: Authentication & Payment Routes
    // ===================================================================
    
    // Authentication routes (strict rate limiting)
    this.app.use('/api/v1/auth', strictLimiter, authRouter);
    
    // Payment routes (API rate limiting + auth required)
    this.app.use('/api/v1/payment', apiLimiter, paymentRouter);
    
    // Webhook routes (webhook-specific rate limiting)
    this.app.use('/webhooks', webhooksRouter);
    
    // OpenRouter provisioning routes (Week 2)
    this.app.use('/api/v1/openrouter', apiLimiter, openRouterRouter);
    
    // Analytics routes (Week 3)
    this.app.use('/api/v1/analytics', apiLimiter, analyticsRouter);
    
    // Team/Organization routes (Week 3)
    this.app.use('/api/v1/teams', apiLimiter, teamsRouter);
    
    // Monitoring routes (Week 3)
    this.app.use('/api/v1/monitoring', apiLimiter, monitoringRouter);
    
    // Health checks (comprehensive)
    this.app.use('/health', healthRouter);
    
    logger.info({}, '[API_ROUTES_SETUP] Phase 4 Week 1 routes mounted');

    // ===================================================================
    // Legacy Health Check (backward compatibility)
    // ===================================================================
    this.app.get('/health/legacy', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        service: 'clawdrop-api',
        timestamp: new Date().toISOString(),
        features: {
          x402_enabled: true,
          mempalace_enabled: true,
          fee_collection_enabled: true,
          multi_wing_routing: true,
        },
      });
    });

    // ========================================================================
    // Transaction APIs (with x402 + payment middleware)
    // ========================================================================
    this.app.use('/api', transactionRouter);

    logger.info({}, '[API_ROUTES_SETUP] Transaction routes mounted at /api');

    // ========================================================================
    // Legacy MCP Tool Endpoints (without x402, for compatibility)
    // ========================================================================
    this.app.post('/api/tools/list_tiers', this.handleToolRequest.bind(this, 'list_tiers'));
    this.app.post('/api/tools/quote_tier', this.handleToolRequest.bind(this, 'quote_tier'));
    this.app.post('/api/tools/verify_payment', this.handleToolRequest.bind(this, 'verify_payment'));
    this.app.post('/api/tools/deploy_openclaw_instance', this.handleToolRequest.bind(this, 'deploy_openclaw_instance'));
    this.app.post('/api/tools/get_deployment_status', this.handleToolRequest.bind(this, 'get_deployment_status'));
    this.app.post('/api/tools/start_deployment_walkthrough', this.handleToolRequest.bind(this, 'start_deployment_walkthrough'));

    // Also support GET for list_tiers (no input needed)
    this.app.get('/api/tools/list_tiers', this.handleToolRequest.bind(this, 'list_tiers'));

    // ========================================================================
    // API Documentation
    // ========================================================================
    this.app.get('/api/docs', (req: Request, res: Response) => {
      res.json({
        service: 'Clawdrop Payment Protocol',
        version: '2.0',
        description: 'x402 Payment-Required protocol with multi-wing transaction routing',
        endpoints: {
          transactions: {
            'GET /api/quote': {
              description: 'Generate payment quote without executing',
              params: ['wallet_address', 'tier_id', 'amount_sol', 'from_token'],
            },
            'POST /api/swap': {
              description: 'Token swap with fee collection',
              body: ['wallet_address', 'tier_id', 'from_token', 'amount_sol'],
            },
            'POST /api/transfer': {
              description: 'Direct SOL transfer',
              body: ['wallet_address', 'destination', 'amount_sol'],
            },
            'POST /api/booking': {
              description: 'Flight/hotel booking payment',
              body: ['wallet_address', 'booking_type', 'booking_value_usd'],
            },
            'GET /api/history/:wing': {
              description: 'Retrieve transaction history for wing (swap/transfer/booking)',
              params: ['wing'],
            },
            'GET /api/search': {
              description: 'Search transaction history',
              query: ['keyword', 'wing'],
            },
            'GET /api/stats': {
              description: 'Get transaction statistics and memory summary',
            },
          },
          tools: {
            'POST /api/tools/list_tiers': 'List available subscription tiers',
            'POST /api/tools/quote_tier': 'Get pricing for tier',
            'POST /api/tools/verify_payment': 'Verify payment on-chain',
          },
        },
        features: {
          'x402_protocol': 'HTTP 402 Payment Required standard',
          'fee_models': {
            'swap': '0.35% of transaction value',
            'transfer': '$0.05 flat (~0.0002 SOL at $250/SOL)',
            'booking': '0.5% of booking value',
          },
          'mempalace_integration': 'Persistent transaction memory with multi-wing isolation',
          'multi_wing_routing': 'Separate conversation state per transaction type',
          'code_signatures': '[HFSP_X402_*], [PAYMENT_*], [FEE_*], [MEMPALACE_*], [WING_*]',
        },
      });
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: `Endpoint not found: ${req.method} ${req.path}`,
        hint: 'See /api/docs for available endpoints',
      });
    });
  }

  private async handleToolRequest(
    toolName: string,
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Get input from request body or query params
      const input = req.body || req.query || {};

      logger.info({ tool: toolName, input }, 'Tool request received');

      // Validate input using schemas
      const validator = (ToolInputSchemas as any)[toolName];
      if (!validator) {
        res.status(400).json({
          success: false,
          error: `Unknown tool: ${toolName}`,
        });
        return;
      }

      let validatedInput: any;
      try {
        validatedInput = validator.parse(input);
      } catch (error) {
        if (error instanceof ZodError) {
          res.status(400).json({
            success: false,
            error: `Validation error: ${error.errors[0].message}`,
            details: error.errors,
          });
          return;
        }
        throw error;
      }

      // Call tool handler
      const result = await handleToolCall(toolName, validatedInput);
      const parsedResult = JSON.parse(result);

      logger.info({ tool: toolName, success: true }, 'Tool executed successfully');

      res.json({
        success: true,
        data: parsedResult,
      });
    } catch (error) {
      next(error);
    }
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: any, req: Request, res: Response, next: NextFunction) => {
      logger.error(
        { error: error.message, path: req.path, code: error.code },
        'HTTP error'
      );

      const statusCode = error.statusCode || 500;
      const message = error.message || 'Internal server error';

      res.status(statusCode).json({
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      });
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        logger.info(
          { port: this.port },
          '[API_SERVER_STARTED] Clawdrop API server started with x402 + MemPalace'
        );
        logger.info({}, '[API_FEATURES_ENABLED] x402 protocol, multi-wing routing, fee collection');
        resolve();
      });
    });
  }

  public getApp(): Express {
    return this.app;
  }
}
