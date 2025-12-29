import { Injectable } from "@nestjs/common";
import axios from "axios";

@Injectable()
export class LlmService {
  private readonly OLLAMA_URL =
    process.env.OLLAMA_URL || "http://localhost:11434";

  private readonly OLLAMA_MODEL =
    process.env.OLLAMA_MODEL || "mistral";

  private readonly DEBUG = process.env.DEBUG === "true";

  async callLLM(prompt: string): Promise<string> {
    try {
      const res = await axios.post(
        `${this.OLLAMA_URL}/api/generate`,
        {
          model: this.OLLAMA_MODEL,
          prompt,
          stream: false,
        },
        { timeout: 120_000 }
      );

      if (!res?.data?.response) {
        throw new Error("LLM response is empty");
      }

      return res.data.response;
    } catch (err: any) {
      // Ollama / backend errors
      if (err?.response) {
        const status = err.response.status;
        const bodyStr = JSON.stringify(err.response.data);
        const msg = `LLM backend error ${status}: ${bodyStr}`;
        if (this.DEBUG) console.error(msg);
        throw new Error(msg);
      }

      // Connection errors
      if (err?.code === "ECONNREFUSED") {
        throw new Error(
          `Cannot connect to LLM at ${this.OLLAMA_URL}: ${err.message}`
        );
      }

      // Fallback
      throw new Error(
        `LLM request error: ${err?.message || String(err)}`
      );
    }
  }
}

// Backwards-compatible function export so existing non-Nest code keeps working
const _defaultLlm = new LlmService();
export const callLLM = (prompt: string) => _defaultLlm.callLLM(prompt);
