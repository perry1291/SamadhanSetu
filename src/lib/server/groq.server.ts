/**
 * Server-only Groq client.
 *
 * SECURITY CONTRACT:
 *  - `GROQ_API_KEY` is read from `process.env` only. It is never read via
 *    `import.meta.env`, never `VITE_`-prefixed, and this module carries the
 *    server-only marker so importing it from a component fails the build.
 *  - The key is never logged, never returned, and never included in an error
 *    message. Failures are reported as a status code plus a short reason.
 *  - Groq is used strictly for structured grievance classification and audio
 *    transcription. There is no free-form chat surface exposed to citizens.
 *
 * Model identifiers below were verified against this account's live
 * `GET /v1/models` response rather than assumed.
 */
import "@tanstack/react-start/server-only";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/** Chat model used for classification. Supports strict `json_schema` output. */
export const GROQ_CHAT_MODEL = "openai/gpt-oss-120b";
/** Multilingual speech-to-text. Auto-detects Hindi and English. */
export const GROQ_TRANSCRIBE_MODEL = "whisper-large-v3";
export const GROQ_PROVIDER = "groq";

const REQUEST_TIMEOUT_MS = 30_000;

/** Raised for every Groq failure. Carries no key and no provider internals. */
export class GroqUnavailableError extends Error {
  readonly status: number | undefined;
  constructor(reason: string, status?: number) {
    super(`Groq request failed: ${reason}`);
    this.name = "GroqUnavailableError";
    this.status = status;
  }
}

function readApiKey(): string {
  const direct = process.env["GROQ_API_KEY"];
  if (direct !== undefined && direct.trim() !== "") return direct.trim();

  // Dev convenience, mirroring db.server.ts: load the project env file when the
  // process was not started with it. No-op in production.
  if (typeof process.loadEnvFile === "function") {
    for (const file of [".env.local", ".env"]) {
      try {
        process.loadEnvFile(file);
      } catch {
        // Absent file is the normal production case.
      }
      const loaded = process.env["GROQ_API_KEY"];
      if (loaded !== undefined && loaded.trim() !== "") return loaded.trim();
    }
  }
  throw new GroqUnavailableError("GROQ_API_KEY is not configured");
}

/** Whether a key is present, without revealing or returning it. */
export function isGroqConfigured(): boolean {
  try {
    readApiKey();
    return true;
  } catch {
    return false;
  }
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } catch (error: unknown) {
    if (error instanceof GroqUnavailableError) throw error;
    const name = error instanceof Error ? error.name : "UnknownError";
    throw new GroqUnavailableError(name === "AbortError" ? "timeout" : name);
  } finally {
    clearTimeout(timer);
  }
}

export interface ChatJsonRequest {
  system: string;
  user: string;
  /** JSON Schema the response must conform to. Enforced by the provider. */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  /** 0 keeps classification deterministic for a given complaint. */
  temperature?: number;
  maxTokens?: number;
}

export interface ChatJsonResponse {
  /** Parsed JSON. Still validated by the caller against a Zod schema. */
  data: unknown;
  /** Model string reported by the API, which may be more specific than requested. */
  model: string;
}

/**
 * Structured chat completion.
 *
 * Uses `response_format: json_schema` with `strict: true`. Plain `json_object`
 * mode was tested and returned inconsistent shapes, so the schema is required
 * rather than optional.
 */
export function groqChatJson(request: ChatJsonRequest): Promise<ChatJsonResponse> {
  const apiKey = readApiKey();

  return withTimeout(async (signal) => {
    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_CHAT_MODEL,
        temperature: request.temperature ?? 0,
        max_completion_tokens: request.maxTokens ?? 1200,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: request.schemaName, strict: true, schema: request.jsonSchema },
        },
      }),
    });

    if (!response.ok) {
      // Status only. The body can echo request content and is not logged.
      throw new GroqUnavailableError(`http_${response.status}`, response.status);
    }

    const payload = (await response.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new GroqUnavailableError("empty_completion");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Malformed JSON is a provider fault, not a citizen-visible error.
      throw new GroqUnavailableError("invalid_json");
    }
    return { data: parsed, model: payload.model ?? GROQ_CHAT_MODEL };
  });
}

export interface TranscriptionRequest {
  audio: Uint8Array;
  fileName: string;
  mimeType: string;
  /** Optional BCP-47 hint. Omitted to let the model auto-detect Hindi vs English. */
  languageHint?: string;
}

export interface TranscriptionResponse {
  text: string;
  /** Language as reported by the provider, e.g. "Hindi" or "English". */
  language: string;
  durationSeconds: number | undefined;
  model: string;
}

/**
 * Audio transcription. `verbose_json` is requested so the detected language and
 * duration come back alongside the text, rather than being inferred.
 */
export function groqTranscribe(request: TranscriptionRequest): Promise<TranscriptionResponse> {
  const apiKey = readApiKey();

  return withTimeout(async (signal) => {
    const form = new FormData();
    form.set(
      "file",
      new File([request.audio as BlobPart], request.fileName, {
        type: request.mimeType,
      }),
    );
    form.set("model", GROQ_TRANSCRIBE_MODEL);
    form.set("response_format", "verbose_json");
    // Nudges the model toward Indian government vocabulary without constraining
    // the language, improving accuracy on scheme and department names.
    form.set(
      "prompt",
      "Indian citizen grievance about government services such as EPFO, LPG, Indian Railways, India Post, income tax, passport, banking or highways.",
    );
    if (request.languageHint !== undefined) form.set("language", request.languageHint);

    const response = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      throw new GroqUnavailableError(`http_${response.status}`, response.status);
    }

    const payload = (await response.json()) as {
      text?: string;
      language?: string;
      duration?: number;
    };
    const text = (payload.text ?? "").trim();
    // An empty transcript is reported as a failure. It is never presented to the
    // citizen as if speech had been understood.
    if (text === "") throw new GroqUnavailableError("empty_transcript");

    return {
      text,
      language: payload.language ?? "unknown",
      durationSeconds: typeof payload.duration === "number" ? payload.duration : undefined,
      model: GROQ_TRANSCRIBE_MODEL,
    };
  });
}
