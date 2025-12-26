import { Router } from "express";
import { callLLM } from "../services/llm.service";
import { RateLimiter } from "../lib/security/rateLimiter";
import { platform_database, generateContext } from "../services/data.service";

const router = Router();

// In-memory store for session-based memory
const sessionMemory = {};

/**
 * Remove common lead-in phrases the model may prepend to responses
 * (e.g. "Based on the data you've provided,"). This is defensive
 * post-processing to ensure replies start directly with the answer.
 */
function stripPrefatoryPhrases(text: string): string {
  if (!text || typeof text !== "string") return text;
  let s = text.trim();

  const patterns: RegExp[] = [
    /^(based on (the )?(data|information) (you've|you have|you) (provided|given)[\s,:-]*)/i,
    /^(according to (the )?(data|information)[\s,:-]*)/i,
    /^(from the provided (data|information)[\s,:-]*)/i,
    /^(as per (the )?(data|information)[\s,:-]*)/i,
    /^(note[:\-]?\s*)/i,
  ];

  for (const re of patterns) {
    if (re.test(s)) s = s.replace(re, "").trim();
  }

  // Trim stray leading punctuation or conjunctions
  s = s.replace(/^[,;:\-\s]+/, "");
  s = s.replace(/^(so|therefore|thus)[\s,]+/i, "");

  return s;
}

router.post("/chat", async (req, res) => {
  try {
    // Rate limiting
    const clientIP = req.ip || req.connection?.remoteAddress || "anonymous";
    const rateLimitResult = await RateLimiter.checkLimit(clientIP);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: `Rate limit exceeded. Try again in ${Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)} seconds.`,
        remaining: rateLimitResult.remaining,
        resetTime: rateLimitResult.resetTime,
      });
    }

    // Set rate limit headers
    res.set({
      "X-RateLimit-Limit": RateLimiter.MAX_REQUESTS,
      "X-RateLimit-Remaining": rateLimitResult.remaining,
      "X-RateLimit-Reset": rateLimitResult.resetTime,
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
      /bypass.*rule/i,
    ];
    if (forbiddenPatterns.some((pattern) => pattern.test(question))) {
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
      .map((entry) => `${entry.role === "user" ? "You" : "Bot"}: ${entry.content}`)
      .join("\n");

    // Include DB-derived user profile/context (views, active game, etc.)
    const userProfileContext = generateContext(user.id);

    const systemPrompt = `
You are an expert game development assistant. Respond based only on the provided CONTEXT and QUESTION. Do not make assumptions or fabricate details.
- Do NOT begin your response with leading phrases such as "Based on the data you've provided", "According to the information", or similar; start directly with the answer or recommended action.
- If the CONTEXT is missing or unclear, ask the user for clarification.
- Provide concise, actionable advice tailored to the user's input.
- Avoid overly formal or robotic language; keep the tone friendly and supportive.
- Encourage follow-up questions to refine the discussion.
- If the user is a developer, suggest checking game statistics like view counts.
`;

    const userData = platform_database[user.id];
    let rolePrompt = "";
    if (userData) {
      if (userData.role === "developer") {
        const activeGame = userData.active_game || "your game";
        const progress = userData.progress || "in progress";
        const completedStr = userData.completed_games ? userData.completed_games.join(", ") : "none";
        rolePrompt = `
You are a game development assistant providing factual insights based on the CONTEXT. The user is working on ${activeGame} (${progress} complete). They've previously completed: ${completedStr}.

STYLE: Provide concise, factual insights based on the CONTEXT. Avoid speculation. Ask a follow-up question to clarify or narrow down the issue.

SCOPE: Game design, programming, engines (Unity/Unreal/Godot), art, audio, debugging, optimization, launch.
`;
      } else if (userData.role === "buyer") {
        const favGame = userData.favourite_game || "your favourite game";
        const budget = userData.budget || "your budget";
        const completedStr = userData.completed_games ? userData.completed_games.join(", ") : "none";
        rolePrompt = `
You are a gaming assistant providing factual recommendations based on the CONTEXT. The user’s favourite game is ${favGame}, their budget is $${budget}, and they've completed: ${completedStr}.

STYLE: Provide concise, factual recommendations based on the CONTEXT. Avoid speculation. Ask a follow-up question to refine preferences.

SCOPE: Game recommendations, sales, genres, platforms, reviews, deals.
`;
      }
    } else {
      rolePrompt = `
You are a Video Game Assistant. Use ONLY the CONTEXT to answer the QUESTION. Do not provide any information not in the CONTEXT. If the QUESTION cannot be answered using the CONTEXT, say exactly: "Can I help you with anything else?"
`;
    }

    if (userData && userData.role === "developer") {
      rolePrompt += `\nWould you like to see how many people have viewed your game? You can ask me to show your game statistics.`;
    }

    const prompt = `
  ${systemPrompt}
  ${rolePrompt}

  USER_PROFILE:
  ${userProfileContext}

  CONTEXT:
  ${context}

  QUESTION: ${sanitizedQuestion}
  `;

    const rawAnswer = await callLLM(prompt);
    const answer = stripPrefatoryPhrases(rawAnswer);

    // Append the bot's response to the session history (cleaned)
    sessionMemory[sessionId].push({ role: "bot", content: answer });

    res.json({ answer });
  } catch (err) {
    console.error(err);
    const debug = process.env.DEBUG === "true" || process.env.NODE_ENV === "development";
    const message = debug ? (err instanceof Error ? err.message : String(err)) : "LLM error";
    res.status(500).json({ error: message });
  }
});

router.get("/game/views", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      return res.status(400).json({ error: "User not authenticated." });
    }

    const userData = platform_database[user.id];
    if (!userData || userData.role !== "developer") {
      return res.status(403).json({ error: "Only developers can access view counts." });
    }

    const views = userData.views || { yesterday: 0, last_7_days: 0 };
    res.json({
      activeGame: userData.active_game,
      views,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch view counts." });
  }
});

export default router;
