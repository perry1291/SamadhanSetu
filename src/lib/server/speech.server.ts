/**
 * Speech-to-text provider abstraction.
 *
 * The UI never talks to a speech vendor. It uploads audio to a server function,
 * which calls whichever provider `resolveSpeechProvider()` returns. Swapping
 * vendor (Bhashini, Azure, self-hosted Whisper) means implementing one interface.
 *
 * Honesty rule: a provider must never invent a transcript. When none is
 * configured, or transcription fails, the result is an explicit failure with a
 * reason code. No fabricated complaint text is ever shown to a citizen.
 */
import "@tanstack/react-start/server-only";

import type { ComplaintLanguage } from "@/lib/validation/complaint";
import {
  GROQ_PROVIDER,
  GROQ_TRANSCRIBE_MODEL,
  GroqUnavailableError,
  groqTranscribe,
  isGroqConfigured,
} from "./groq.server";

export type TranscriptionFailureReason =
  | "provider_not_configured"
  | "provider_error"
  | "audio_too_large"
  | "audio_unsupported"
  | "no_speech_detected";

export type TranscriptionResult =
  | {
      ok: true;
      transcript: string;
      detectedLanguage: ComplaintLanguage;
      provider: string;
      model: string;
      durationSeconds?: number;
    }
  | { ok: false; reason: TranscriptionFailureReason };

export interface SpeechProvider {
  readonly id: string;
  readonly isConfigured: boolean;
  transcribe(input: {
    audio: Uint8Array;
    mimeType: string;
    fileName: string;
  }): Promise<TranscriptionResult>;
}

/**
 * Maps a provider's language label onto our closed vocabulary.
 *
 * Anything other than Hindi or English becomes `other` rather than being forced
 * into one of them, so an unexpected language is visible instead of mislabelled.
 */
export function normalizeLanguage(raw: string): ComplaintLanguage {
  const value = raw.trim().toLowerCase();
  if (value === "hi" || value.startsWith("hindi")) return "hi";
  if (value === "en" || value.startsWith("english")) return "en";
  return "other";
}

/** Groq Whisper. Verified to auto-detect both Hindi and English. */
class GroqWhisperProvider implements SpeechProvider {
  readonly id = `${GROQ_PROVIDER}:${GROQ_TRANSCRIBE_MODEL}`;

  get isConfigured(): boolean {
    return isGroqConfigured();
  }

  async transcribe(input: {
    audio: Uint8Array;
    mimeType: string;
    fileName: string;
  }): Promise<TranscriptionResult> {
    try {
      // No language hint: the citizen may speak either language, and forcing one
      // degrades the other.
      const result = await groqTranscribe({
        audio: input.audio,
        mimeType: input.mimeType,
        fileName: input.fileName,
      });
      return {
        ok: true,
        transcript: result.text,
        detectedLanguage: normalizeLanguage(result.language),
        provider: GROQ_PROVIDER,
        model: result.model,
        ...(result.durationSeconds !== undefined
          ? { durationSeconds: result.durationSeconds }
          : {}),
      };
    } catch (error: unknown) {
      if (error instanceof GroqUnavailableError) {
        // Reason code only; the message never contains the key or audio content.
        console.error(`[speech] transcription failed: ${error.message}`);
        return {
          ok: false,
          reason: error.message.includes("empty_transcript")
            ? "no_speech_detected"
            : "provider_error",
        };
      }
      console.error(
        `[speech] transcription failed: ${error instanceof Error ? error.name : "UnknownError"}`,
      );
      return { ok: false, reason: "provider_error" };
    }
  }
}

/** Used when no vendor is configured. Reports the truth instead of guessing. */
class UnconfiguredSpeechProvider implements SpeechProvider {
  readonly id = "unconfigured";
  readonly isConfigured = false;

  transcribe(): Promise<TranscriptionResult> {
    return Promise.resolve({ ok: false, reason: "provider_not_configured" });
  }
}

export function resolveSpeechProvider(): SpeechProvider {
  const groq = new GroqWhisperProvider();
  return groq.isConfigured ? groq : new UnconfiguredSpeechProvider();
}
