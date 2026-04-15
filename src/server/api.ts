import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { handleToolCall } from './tools';
import { ToolInputMap } from './schemas';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';

/**
 * Express HTTP API server for Clawdrop
 * Wraps MCP tools in REST endpoints
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
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', service: 'clawdrop-api', timestamp: new Date().toISOString() });
    });

    // Tool endpoints - one per tool
    this.app.post('/api/tools/list_tiers', this.handleToolRequest.bind(this, 'list_tiers'));
    this.app.post('/api/tools/quote_tier', this.handleToolRequest.bind(this, 'quote_tier'));
    this.app.post('/api/tools/verify_payment', this.handleToolRequest.bind(this, 'verify_payment'));
    this.app.post('/api/tools/deploy_openclaw_instance', this.handleToolRequest.bind(this, 'deploy_openclaw_instance'));
    this.app.post('/api/tools/get_deployment_status', this.handleToolRequest.bind(this, 'get_deployment_status'));

    // Also support GET for list_tiers (no input needed)
    this.app.get('/api/tools/list_tiers', this.handleToolRequest.bind(this, 'list_tiers'));

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: `Endpoint not found: ${req.method} ${req.path}`,
      });
    });
  }

  private async handleToolRequest(toolName: string, req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Get input from request body or query params
      const input = req.body || req.query || {};

      logger.info({ tool: toolName, input }, 'Tool request received');

      // Validate input using schemas
      const validator = (ToolInputMap as any)[toolName];
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
      logger.error({ error: error.message, path: req.path }, 'HTTP error');

      const statusCode = error.statusCode || 500;
      const message = error.message || 'Internal server error';

      res.status(statusCode).json({
        success: false,
        error: message,
      });
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        logger.info({ port: this.port }, 'Clawdrop API server started');
        resolve();
      });
    });
  }

  public getApp(): Express {
    return this.app;
  }
}
