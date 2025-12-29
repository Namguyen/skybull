import { Injectable } from '@nestjs/common';

interface TokenEntry {
  tokens: number;
  resetTime: number;
}

@Injectable()
export class TokenQuotaService {
  private store: Record<string, TokenEntry> = {};
  private readonly DEFAULT_TOKENS = parseInt(process.env.DEFAULT_TOKENS || '1000');
  private readonly WINDOW_MS = parseInt(process.env.TOKEN_WINDOW_MS || String(24 * 60 * 60 * 1000));

  async checkAndReserve(userId: string, tokensNeeded: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    if (!this.store[userId] || this.store[userId].resetTime < now) {
      this.store[userId] = { tokens: this.DEFAULT_TOKENS, resetTime: now + this.WINDOW_MS };
    }

    const entry = this.store[userId];
    if (entry.tokens < tokensNeeded) {
      return { allowed: false, remaining: entry.tokens, resetTime: entry.resetTime };
    }

    entry.tokens -= tokensNeeded;
    return { allowed: true, remaining: entry.tokens, resetTime: entry.resetTime };
  }

  getRemaining(userId: string) {
    const now = Date.now();
    const entry = this.store[userId];
    if (!entry || entry.resetTime < now) return { remaining: this.DEFAULT_TOKENS, resetTime: now + this.WINDOW_MS };
    return { remaining: entry.tokens, resetTime: entry.resetTime };
  }

  // Admin helper to reset a user's tokens
  reset(userId: string) {
    delete this.store[userId];
  }
}
