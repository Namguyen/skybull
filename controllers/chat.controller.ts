import { Controller, Post, Body, Req, Res, Get } from '@nestjs/common';
// Avoid importing express at runtime to keep this module framework-agnostic
import { LlmService } from '../services/llm.service';
import { RateLimiter } from '../services/rateLimiter.service';
import { TokenQuotaService } from '../services/tokenQuota.service';
import { platform_database, generateContext } from '../services/data.service';

const sessionMemory: Record<string, Array<{ role: string; content: string }>> = {};

function stripPrefatoryPhrases(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let s = text.trim();

  const patterns: RegExp[] = [
    /^(based on (the )?(data|information) (you've|you have|you) (provided|given)[\s,:-]*)/i,
    /^(according to (the )?(data|information)[\s,:-]*)/i,
    /^(from the provided (data|information)[\s,:-]*)/i,
    /^(as per (the )?(data|information)[\s,:-]*)/i,
    /^(note[:\-]?\s*)/i,
  ];

  for (const re of patterns) {
    if (re.test(s)) s = s.replace(re, '').trim();
  }

  s = s.replace(/^[,;:\-\s]+/, '');
  s = s.replace(/^(so|therefore|thus)[\s,]+/i, '');

  return s;
}

@Controller('api')
export class ChatController {
  constructor(private readonly llm: LlmService, private readonly tokenQuota: TokenQuotaService) {}

  @Post('chat')
  async chat(@Req() req: any, @Body('question') questionBody: any) {
    try {
      const clientIP = req.ip || (req.connection as any)?.remoteAddress || 'anonymous';
      const rateLimitResult = await RateLimiter.checkLimit(clientIP);
      if (!rateLimitResult.allowed) {
        (req as any).res.status(429).json({
          error: `Rate limit exceeded. Try again in ${Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)} seconds.`,
          remaining: rateLimitResult.remaining,
          resetTime: rateLimitResult.resetTime,
        });
        return;
      }

      (req as any).res.set({
        'X-RateLimit-Limit': (RateLimiter as any).MAX_REQUESTS,
        'X-RateLimit-Remaining': rateLimitResult.remaining,
        'X-RateLimit-Reset': rateLimitResult.resetTime,
      });

      const user = (req as any).user;
      const question = questionBody;

      if (!question || typeof question !== 'string') {
        (req as any).res.status(400).json({ error: 'Missing or invalid question' });
        return;
      }

      const forbiddenPatterns = [
        /ignore.*instruction/i,
        /override.*prompt/i,
        /system.*message/i,
        /admin.*command/i,
        /bypass.*rule/i,
      ];
      if (forbiddenPatterns.some((pattern) => pattern.test(question))) {
        (req as any).res.status(400).json({ error: 'Invalid input detected. Please rephrase your question.' });
        return;
      }

      const sanitizedQuestion = question.trim().substring(0, 500);
      if (sanitizedQuestion.length < 3) {
        (req as any).res.status(400).json({ error: 'What can I help you with today?' });
        return;
      }

      const sessionId = (user && (user as any).id) || clientIP;
      if (!sessionMemory[sessionId]) sessionMemory[sessionId] = [];
      sessionMemory[sessionId].push({ role: 'user', content: sanitizedQuestion });

      const context = sessionMemory[sessionId]
        .map((entry) => `${entry.role === 'user' ? 'You' : 'Bot'}: ${entry.content}`)
        .join('\n');

      const userProfileContext = generateContext((user as any)?.id);

      const userData = platform_database[(user as any)?.id];
      let rolePrompt = '';
      if (userData) {
        if (userData.role === 'developer') {
          const activeGame = userData.active_game || 'your game';
          const progress = userData.progress || 'in progress';
          const completedStr = userData.completed_games ? userData.completed_games.join(', ') : 'none';
          rolePrompt = `
IMPORTANT: You MUST NOT answer the QUESTION unless the CONTEXT contains the answer. If the CONTEXT does not contain information to answer the QUESTION, respond exactly with: "Can I help you with anything else?" Do not use outside knowledge, databases, APIs, or external sources. Only use the CONTEXT.

If the user asks for your name, respond exactly with: "ChaCha".
You are a game development assistant providing factual insights based on the CONTEXT. The user is working on ${activeGame} (${progress} complete). They've previously completed: ${completedStr}.

STYLE: By default, provide concise, factual insights based on the CONTEXT (2–4 sentences). Avoid speculation. If the user requests a list, table, or detailed information (e.g., "list 10 games" or "show current sales"), provide the full list or table as requested, including links or details if available. Ask a follow-up question only if it helps clarify or narrow down the issue.

If the user asks about sales events and there are no current or upcoming sales available, respond exactly with: "Right now there are no sales available."

If the CONTEXT does not contain information to answer the QUESTION, respond exactly with: "Can I help you with anything else?"

SCOPE: Game design, programming, engines (Unity/Unreal/Godot), art, audio, debugging, optimization, launch, game sales, and platform promotions (e.g., Steam, Epic Games).
`;
        } else if (userData.role === 'buyer') {
          const favGame = userData.favourite_game || 'your favourite game';
          const budget = userData.budget || 'your budget';
          const completedStr = userData.completed_games ? userData.completed_games.join(', ') : 'none';
          rolePrompt = `
IMPORTANT: You MUST NOT answer the QUESTION unless the CONTEXT contains the answer. If the CONTEXT does not contain information to answer the QUESTION, respond exactly with: "Can I help you with anything else?" Do not use outside knowledge, databases, APIs, or external sources. Only use the CONTEXT.
You are a gaming assistant providing factual recommendations based on the CONTEXT. The user’s favourite game is ${favGame}, their budget is $${budget}, and they've completed: ${completedStr}.

STYLE: Provide concise, factual recommendations based on the CONTEXT. Avoid speculation. Ask a follow-up question to refine preferences.

If the user asks about sales events and there are no current or upcoming sales available, respond exactly with: "Right now there are no sales available."

If the CONTEXT does not contain information to answer the QUESTION, respond exactly with: "Can I help you with anything else?"

SCOPE: Game recommendations, sales, genres, platforms, reviews, deals.
`;
        }
      } else {
        rolePrompt = `
You are a Video Game Assistant. Use ONLY the CONTEXT to answer the QUESTION. Do not provide any information not in the CONTEXT. If the QUESTION cannot be answered using the CONTEXT, say exactly: "Can I help you with anything else?"
`;
      }

      if (userData && userData.role === 'developer') {
        rolePrompt += `\nWould you like to see how many people have viewed your game? You can ask me to show your game statistics.`;
      }

      const prompt = `\n  ${rolePrompt}\n\n  USER_PROFILE:\n  ${userProfileContext}\n\n  CONTEXT:\n  ${context}\n\n  QUESTION: ${sanitizedQuestion}\n  `;

      // Token estimation: rough heuristic (chars/4 for tokens) + buffer for response
      const estimatedReqTokens = Math.max(10, Math.ceil(sanitizedQuestion.length / 4));
      const estimatedRespTokens = 150; // conservative response allowance
      const tokensNeeded = estimatedReqTokens + estimatedRespTokens;

      // Reserve tokens from user's quota (session-based user id or ip)
      const quotaUserId = sessionId;
      const tokenCheck = await this.tokenQuota.checkAndReserve(quotaUserId, tokensNeeded);
      if (!tokenCheck.allowed) {
        (req as any).res.status(402).json({
          error: 'Token quota exhausted. Please wait for quota to reset or contact support to increase your limit.',
          remainingTokens: tokenCheck.remaining,
          resetTime: tokenCheck.resetTime,
        });
        return;
      }

      const rawAnswer = await this.llm.callLLM(prompt);
      const answer = stripPrefatoryPhrases(rawAnswer);

      sessionMemory[sessionId].push({ role: 'bot', content: answer });

      (req as any).res.json({ answer });
      return;
    } catch (err) {
      console.error(err);
      const debug = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';
      const message = debug ? (err instanceof Error ? err.message : String(err)) : 'LLM error';
      (req as any).res.status(500).json({ error: message });
    }
  }

  @Get('game/views')
  async views(@Req() req: any) {
    try {
      const user = (req as any).user;
      if (!user || !(user as any).id) {
        (req as any).res.status(400).json({ error: 'User not authenticated.' });
        return;
      }

      const userData = platform_database[(user as any).id];
      if (!userData || userData.role !== 'developer') {
        (req as any).res.status(403).json({ error: 'Only developers can access view counts.' });
        return;
      }

      const views = userData.views || { yesterday: 0, last_7_days: 0 };
      (req as any).res.json({
        activeGame: userData.active_game,
        views,
      });
    } catch (err) {
      console.error(err);
      (req as any).res.status(500).json({ error: 'Failed to fetch view counts.' });
    }
  }
}
