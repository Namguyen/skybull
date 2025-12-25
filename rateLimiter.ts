// lib/security/rateLimiter.ts
// Rate limiting implementation

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

export class RateLimiter {
  private static store: RateLimitStore = {};
  public static readonly MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '20');
  public static readonly WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000');

  /**
   * Check if request should be rate limited
   */
  static async checkLimit(identifier: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    const now = Date.now();
    //const windowStart = now - this.WINDOW_MS;

    // Clean up old entries
    this.cleanup();

    // Get or create entry for this identifier
    if (!this.store[identifier] || this.store[identifier].resetTime < now) {
      this.store[identifier] = {
        count: 0,
        resetTime: now + this.WINDOW_MS
      };
    }

    const entry = this.store[identifier];

    // Check if limit exceeded
    if (entry.count >= this.MAX_REQUESTS) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime
      };
    }

    // Increment counter
    entry.count++;

    return {
      allowed: true,
      remaining: this.MAX_REQUESTS - entry.count,
      resetTime: entry.resetTime
    };
  }

  /**
   * Get rate limit key from request
   */
  static getRateLimitKey(req: Request): string {
    // Try to get IP from various headers
    const forwarded = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const sessionId = req.headers.get('x-session-id');
    
    // Use session ID if available, otherwise use IP
    if (sessionId) {
      return `session:${sessionId}`;
    }
    
    if (forwarded) {
      return `ip:${forwarded.split(',')[0].trim()}`;
    }
    
    if (realIp) {
      return `ip:${realIp}`;
    }
    
    // Fallback to a generic key (not ideal for production)
    return 'anonymous';
  }

  /**
   * Clean up expired entries
   */
  private static cleanup(): void {
    const now = Date.now();
    for (const key in this.store) {
      if (this.store[key].resetTime < now) {
        delete this.store[key];
      }
    }
  }

  /**
   * Reset limits for a specific identifier
   */
  static reset(identifier: string): void {
    delete this.store[identifier];
  }

  /**
   * Get current usage stats
   */
  static getStats(identifier: string): {
    used: number;
    limit: number;
    remaining: number;
  } | null {
    const entry = this.store[identifier];
    if (!entry) {
      return {
        used: 0,
        limit: this.MAX_REQUESTS,
        remaining: this.MAX_REQUESTS
      };
    }

    return {
      used: entry.count,
      limit: this.MAX_REQUESTS,
      remaining: Math.max(0, this.MAX_REQUESTS - entry.count)
    };
  }
}

// For production, use Redis-based rate limiting
export class RedisRateLimiter {
  // This would connect to Redis for distributed rate limiting
  // Placeholder for production implementation
  
  static async checkLimit(identifier: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    // In production, this would:
    // 1. Connect to Redis
    // 2. Use Redis INCR with TTL
    // 3. Return rate limit status
    
    // For now, fallback to in-memory
    return RateLimiter.checkLimit(identifier);
  }
}