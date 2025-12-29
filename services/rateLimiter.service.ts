// Rate limiting implementation (moved from lib/security/rateLimiter.ts)

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

	static async checkLimit(identifier: string): Promise<{
		allowed: boolean;
		remaining: number;
		resetTime: number;
	}> {
		const now = Date.now();
		this.cleanup();
		if (!this.store[identifier] || this.store[identifier].resetTime < now) {
			this.store[identifier] = {
				count: 0,
				resetTime: now + this.WINDOW_MS,
			};
		}
		const entry = this.store[identifier];
		if (entry.count >= this.MAX_REQUESTS) {
			return {
				allowed: false,
				remaining: 0,
				resetTime: entry.resetTime,
			};
		}
		entry.count++;
		return {
			allowed: true,
			remaining: this.MAX_REQUESTS - entry.count,
			resetTime: entry.resetTime,
		};
	}

	static getRateLimitKey(req: any): string {
		if (!req || !req.headers) return 'anonymous';
		const headers = req.headers;
		const getHeader = (name: string) => {
			if (typeof headers.get === 'function') return headers.get(name);
			const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
			if (!key) return undefined;
			return headers[key];
		};
		const sessionId = getHeader('x-session-id');
		if (sessionId) return `session:${sessionId}`;
		const forwarded = getHeader('x-forwarded-for');
		if (forwarded) return `ip:${String(forwarded).split(',')[0].trim()}`;
		const realIp = getHeader('x-real-ip');
		if (realIp) return `ip:${realIp}`;
		if (req.ip) return `ip:${req.ip}`;
		if (req.connection && (req.connection as any).remoteAddress) return `ip:${(req.connection as any).remoteAddress}`;
		return 'anonymous';
	}

	private static cleanup(): void {
		const now = Date.now();
		for (const key in this.store) {
			if (this.store[key].resetTime < now) {
				delete this.store[key];
			}
		}
	}

	static reset(identifier: string): void {
		delete this.store[identifier];
	}

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