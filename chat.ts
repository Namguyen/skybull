import { Router } from "express";
import { callLLM } from "../services/llm.service";
import { RateLimiter } from "../lib/security/rateLimiter";
import { platform_database, generateContext } from "../services/data.service";

const router = Router();

// In-memory store for session-based memory
const sessionMemory = {};

router.post("/chat", async (req, res) => {
  try {
    // Rate limiting
    const clientIP = req.ip || req.connection?.remoteAddress || "anonymous";
    const rateLimitResult = await RateLimiter.checkLimit(clientIP);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: `Rate limit exceeded. Try again in ${Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)} seconds.`,
        remaining: rateLimitResult.remaining,
        resetTime: rateLimitResult.resetTime
      });
    }

    // Set rate limit headers
    res.set({
      "X-RateLimit-Limit": RateLimiter.MAX_REQUESTS,
      "X-RateLimit-Remaining": rateLimitResult.remaining,
      "X-RateLimit-Reset": rateLimitResult.resetTime
    });

    const user = (req as any).user;
    const question = req.body.question;

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Missing or invalid question" });
    }

    // Input validation: Prevent prompt injection
    const forbiddenPatterns = [
      /ignore.*instruction/i,
      /override.*prompt/i,
      /system.*message/i,
      /admin.*command/i,
      /bypass.*rule/i
    ];
    if (forbiddenPatterns.some(pattern => pattern.test(question))) {
      return res.status(400).json({ error: "Invalid input detected. Please rephrase your question." });
    }

    // Sanitize: Remove excessive whitespace, limit length
    const sanitizedQuestion = question.trim().substring(0, 500); // Max 500 chars
    if (sanitizedQuestion.length < 3) {
      return res.status(400).json({ error: "What can I help you with today?" });
    }

    // Retrieve or initialize session memory
    const sessionId = user.id || clientIP;
    if (!sessionMemory[sessionId]) {
      sessionMemory[sessionId] = [];
    }

    // Append the new question to the session history
    sessionMemory[sessionId].push({ role: "user", content: sanitizedQuestion });

    // Generate context from session history
    const context = sessionMemory[sessionId]
      .map(entry => `${entry.role === "user" ? "You" : "Bot"}: ${entry.content}`)
      .join("\n");

    // Role-based prompt
    const userData = platform_database[user.id];
    let rolePrompt = "";
    // Refined role-based prompt for developers
    if (userData && userData.role === "developer") {
      const activeGame = userData.active_game || "your game";
      const progress = userData.progress || "in progress";
      const completedStr = userData.completed_games ? userData.completed_games.join(", ") : "none";
      rolePrompt = `
You are a game development assistant providing factual insights based on the CONTEXT. The user is working on ${activeGame} (${progress} complete). They've previously completed: ${completedStr}.

STYLE: Provide concise, factual insights based on the CONTEXT. Avoid speculation. Ask a follow-up question to clarify or narrow down the issue.

SCOPE: Game design, programming, engines (Unity/Unreal/Godot), art, audio, debugging, optimization, launch.
`;
    } else if (userData && userData.role === "buyer") {
      const favGame = userData.favourite_game || "your favourite game";
      const budget = userData.budget || "your budget";
      const completedStr = userData.completed_games ? userData.completed_games.join(", ") : "none";
      rolePrompt = `
You are a gaming assistant providing factual recommendations based on the CONTEXT. The user’s favourite game is ${favGame}, their budget is $${budget}, and they've completed: ${completedStr}.

STYLE: Provide concise, factual recommendations based on the CONTEXT. Avoid speculation. Ask a follow-up question to refine preferences.

SCOPE: Game recommendations, sales, genres, platforms, reviews, deals.
`;
    } else {
      rolePrompt = `
You are a Video Game Assistant. Use ONLY the CONTEXT to answer the QUESTION. Do not provide any information not in the CONTEXT. If the QUESTION cannot be answered using the CONTEXT, say exactly: "Can I help you with anything else?"
`;
    }

    const prompt = `
${rolePrompt}

CONTEXT:
${context}

QUESTION: ${sanitizedQuestion}
`;

    const answer = await callLLM(prompt);

    // Append the bot's response to the session history
    sessionMemory[sessionId].push({ role: "bot", content: answer });

    res.json({ answer });
  } catch (err) {
    console.error(err);
    const debug = process.env.DEBUG === "true" || process.env.NODE_ENV === "development";
    const message = debug ? (err instanceof Error ? err.message : String(err)) : "LLM error";
    res.status(500).json({ error: message });
  }
});

export default router;
