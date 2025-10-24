/**
 * Structured logging system with correlation IDs
 */

export interface LogContext {
  correlationId: string;
  requestId?: string;
  userId?: string;
  service?: string;
  deployment?: string;
  region?: string;
  canary?: boolean;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
}

export class StructuredLogger {
  private context: LogContext;
  
  constructor(context: Partial<LogContext> = {}) {
    this.context = {
      correlationId: context.correlationId || this.generateCorrelationId(),
      ...context
    };
  }
  
  /**
   * Generate unique correlation ID for request tracing
   */
  private generateCorrelationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }
  
  /**
   * Create child logger with additional context
   */
  child(additionalContext: Partial<LogContext>): StructuredLogger {
    return new StructuredLogger({
      ...this.context,
      ...additionalContext
    });
  }
  
  /**
   * Internal logging method
   */
  private log(
    level: LogEntry['level'],
    message: string,
    metadata?: Record<string, any>,
    error?: Error
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      metadata
    };
    
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }
    
    // Output as structured JSON for log aggregation
    console.log(JSON.stringify(entry));
  }
  
  debug(message: string, metadata?: Record<string, any>): void {
    this.log('DEBUG', message, metadata);
  }
  
  info(message: string, metadata?: Record<string, any>): void {
    this.log('INFO', message, metadata);
  }
  
  warn(message: string, metadata?: Record<string, any>): void {
    this.log('WARN', message, metadata);
  }
  
  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log('ERROR', message, metadata, error);
  }
  
  fatal(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log('FATAL', message, metadata, error);
  }
  
  /**
   * Log HTTP request
   */
  logRequest(request: Request, metadata?: Record<string, any>): void {
    const url = new URL(request.url);
    this.info('HTTP Request', {
      method: request.method,
      path: url.pathname,
      query: url.search,
      headers: Object.fromEntries(request.headers.entries()),
      cf: (request as any).cf,
      ...metadata
    });
  }
  
  /**
   * Log HTTP response
   */
  logResponse(response: Response, duration: number, metadata?: Record<string, any>): void {
    this.info('HTTP Response', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      duration: `${duration}ms`,
      ...metadata
    });
  }
  
  /**
   * Log performance metrics
   */
  logMetrics(metrics: Record<string, any>): void {
    this.info('Performance Metrics', metrics);
  }
  
  /**
   * Create logger from request
   */
  static fromRequest(request: Request, env: any): StructuredLogger {
    const url = new URL(request.url);
    const cfRay = request.headers.get('cf-ray') || undefined;
    const clientIp = request.headers.get('cf-connecting-ip') || undefined;
    
    return new StructuredLogger({
      correlationId: cfRay || StructuredLogger.generateId(),
      requestId: cfRay,
      service: 'mission-control-hq',
      deployment: env.DEPLOYMENT_ID,
      region: env.REGION_ID,
      canary: parseInt(env.CANARY_PERCENT || '0') > 0,
      path: url.pathname,
      method: request.method,
      clientIp
    });
  }
  
  /**
   * Generate unique ID
   */
  static generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }
}

/**
 * Request logging middleware
 */
export function createLoggingMiddleware(env: any) {
  return async (request: Request): Promise<void> => {
    const logger = StructuredLogger.fromRequest(request, env);
    
    // Attach logger to request for use in handlers
    (request as any).logger = logger;
    
    // Log incoming request
    logger.logRequest(request);
    
    // Store start time for duration calculation
    (request as any).startTime = Date.now();
  };
}

/**
 * Response logging wrapper
 */
export function logResponse(request: Request, response: Response): Response {
  const logger = (request as any).logger as StructuredLogger;
  const startTime = (request as any).startTime as number;
  
  if (logger && startTime) {
    const duration = Date.now() - startTime;
    logger.logResponse(response, duration);
    
    // Add correlation ID to response headers
    const headers = new Headers(response.headers);
    headers.set('X-Correlation-ID', logger['context'].correlationId);
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
  
  return response;
}