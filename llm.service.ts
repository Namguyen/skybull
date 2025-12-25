import axios from "axios";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3:1b";
const DEBUG = process.env.DEBUG === "true";

export async function callLLM(prompt: string): Promise<string> {
  try {
    const res = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      },
      { timeout: 120_000 }
    );

    // Defensive handling for multiple backend shapes
    if (res && res.data) {
      if (typeof res.data === "string") return res.data;
      if (res.data.response) return res.data.response;
      if (res.data.result) return res.data.result;
      return JSON.stringify(res.data);
    }

    throw new Error("Empty response from LLM");
  } catch (err: any) {
    // If Ollama returned 404 for model not found, try to list models and attempt a fallback
    if (err?.response?.status === 404) {
      try {
        const modelsRes = await axios.get(`${OLLAMA_URL}/api/models`);
        let models: string[] = [];
        if (Array.isArray(modelsRes.data)) {
          models = modelsRes.data.map((m: any) => (m && m.name) || String(m));
        } else if (modelsRes.data && typeof modelsRes.data === "object") {
          models = Object.keys(modelsRes.data);
        } else {
          models = [String(modelsRes.data)];
        }

        const list = models.length ? models.join(", ") : "(no models returned)";
        if (DEBUG) console.error(`Available models: ${list}`);

        // Try to find a model that starts with the desired base name (e.g., "mistral" -> "mistral:latest")
        const desiredBase = OLLAMA_MODEL.split(":")[0];
        const match = models.find((m) => m.startsWith(desiredBase));
        if (match) {
          if (DEBUG) console.error(`Retrying with fallback model '${match}'`);
          // Retry once with the matched model
          try {
            const retryRes = await axios.post(
              `${OLLAMA_URL}/api/generate`,
              { model: match, prompt, stream: false },
              { timeout: 120_000 }
            );
            if (retryRes && retryRes.data) {
              if (typeof retryRes.data === "string") return retryRes.data;
              if (retryRes.data.response) return retryRes.data.response;
              if (retryRes.data.result) return retryRes.data.result;
              return JSON.stringify(retryRes.data);
            }
          } catch (retryErr: any) {
            if (DEBUG) console.error("Retry with fallback model failed:", retryErr);
            // fall through to throw the original message below
          }
        }

        const msg = `Model '${OLLAMA_MODEL}' not found. Available models: ${list}`;
        if (DEBUG) console.error(msg);
        throw new Error(msg);
      } catch (listErr: any) {
        const msg = `Model '${OLLAMA_MODEL}' not found, and listing models failed: ${listErr?.message || listErr}`;
        if (DEBUG) console.error(listErr);
        throw new Error(msg);
      }
    }

    // Other HTTP errors from Ollama -> include body for debugging
    if (err?.response) {
      const status = err.response.status;
      const body = err.response.data;
      const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
      const msg = `LLM backend error ${status}: ${bodyStr}`;
      if (DEBUG) console.error(msg);
      throw new Error(msg);
    }

    // Connection errors
    if (err?.code === "ECONNREFUSED") {
      throw new Error(`Cannot connect to LLM at ${OLLAMA_URL}: ${err.message}`);
    }

    // Fallback
    throw new Error(`LLM request error: ${err?.message || String(err)}`);
  }
}
