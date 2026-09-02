/**
 * Grievance classification provider.
 *
 * The model recommends; this module decides whether the recommendation is
 * acceptable. Guarantees enforced here:
 *
 *  - Output is parsed with `classificationOutputSchema`, whose `department` and
 *    `priority` are closed enums. A hallucinated or renamed department cannot
 *    survive parsing.
 *  - The department is re-checked against the registry after parsing, as
 *    defence in depth.
 *  - Invalid output is retried a bounded number of times. If it still fails, or
 *    the provider is unreachable, the caller receives an explicit failure and
 *    the grievance goes to manual review. A department is never guessed.
 *  - Nothing is logged that contains complaint text or the API key.
 */
import "@tanstack/react-start/server-only";

import { departmentCatalogueForPrompt, isDepartmentId } from "@/lib/departments";
import {
  CLASSIFICATION_JSON_SCHEMA,
  classificationOutputSchema,
  type ClassificationOutput,
} from "@/lib/validation/complaint";
import {
  GROQ_CHAT_MODEL,
  GROQ_PROVIDER,
  GroqUnavailableError,
  groqChatJson,
  isGroqConfigured,
} from "./groq.server";

const MAX_ATTEMPTS = 2;

export type ClassificationFailureReason =
  "provider_not_configured" | "provider_unavailable" | "invalid_output";

export type ClassificationResult =
  | {
      ok: true;
      output: ClassificationOutput;
      provider: string;
      model: string;
      modelVersion: string;
      attempts: number;
    }
  | { ok: false; reason: ClassificationFailureReason; attempts: number };

export interface ClassificationProvider {
  readonly id: string;
  readonly isConfigured: boolean;
  classify(input: {
    title: string;
    description: string;
    locationHint: string;
  }): Promise<ClassificationResult>;
}

/**
 * Instruction set is deliberately narrow: a routing decision, not a conversation.
 * The catalogue is generated from the department registry so the prompt and the
 * validator cannot drift apart.
 */
function buildSystemPrompt(): string {
  return [
    "You are a grievance routing classifier for an Indian Government citizen grievance portal.",
    "Classify the citizen's grievance into exactly one department from the catalogue provided.",
    "",
    "Rules:",
    "1. Choose the single department whose remit best matches the grievance. Use only the given department ids.",
    "2. If the grievance genuinely does not fit any department, choose the closest one and set confidence below 0.4.",
    "3. category: a short English noun phrase describing the issue type (2 to 6 words).",
    "4. priority: judge from real impact described in the grievance.",
    "   CRITICAL = danger to life, safety or livelihood, or a statutory deadline already breached.",
    "   HIGH = essential service denied, money withheld, or significant hardship continuing.",
    "   MEDIUM = service deficiency causing inconvenience without immediate harm.",
    "   LOW = routine request, information, or minor issue.",
    "5. confidence: your genuine certainty between 0 and 1. Do not default to a high value.",
    "6. reasoning: two or three sentences citing the specific facts in the grievance that drove the department and priority. Write in English. Do not restate the whole grievance.",
    "7. detectedLanguage: 'hi' if the grievance is written in Hindi, 'en' if English, otherwise 'other'.",
    "8. normalizedText: a faithful English rendering of the grievance for search and matching. Preserve every fact. Do not add, judge or embellish. If the grievance is already English, lightly clean it.",
    "",
    "Never invent a department id. Never output anything except the required JSON object.",
    "",
    "Department catalogue:",
    departmentCatalogueForPrompt(),
  ].join("\n");
}

class GroqClassificationProvider implements ClassificationProvider {
  readonly id = `${GROQ_PROVIDER}:${GROQ_CHAT_MODEL}`;

  get isConfigured(): boolean {
    return isGroqConfigured();
  }

  async classify(input: {
    title: string;
    description: string;
    locationHint: string;
  }): Promise<ClassificationResult> {
    if (!this.isConfigured) {
      return { ok: false, reason: "provider_not_configured", attempts: 0 };
    }

    const user = [
      `Grievance title: ${input.title}`,
      `Grievance details: ${input.description}`,
      `Reported location: ${input.locationHint}`,
    ].join("\n\n");
    const system = buildSystemPrompt();

    let attempts = 0;
    let lastReason: ClassificationFailureReason = "invalid_output";

    while (attempts < MAX_ATTEMPTS) {
      attempts += 1;
      try {
        const response = await groqChatJson({
          system,
          user,
          jsonSchema: CLASSIFICATION_JSON_SCHEMA as unknown as Record<string, unknown>,
          schemaName: "grievance_classification",
          temperature: 0,
        });

        const parsed = classificationOutputSchema.safeParse(response.data);
        if (!parsed.success) {
          // Field paths only — never the model's text, which contains the complaint.
          console.error(
            `[classification] invalid output on attempt ${attempts}: ` +
              parsed.error.issues.map((i) => i.path.join(".") || "root").join(","),
          );
          lastReason = "invalid_output";
          continue;
        }

        // Defence in depth: the enum already covers this, but a schema edit that
        // widened the type must not silently allow an unknown department through.
        if (!isDepartmentId(parsed.data.department)) {
          console.error("[classification] department outside controlled registry");
          lastReason = "invalid_output";
          continue;
        }

        return {
          ok: true,
          output: parsed.data,
          provider: GROQ_PROVIDER,
          model: GROQ_CHAT_MODEL,
          modelVersion: response.model,
          attempts,
        };
      } catch (error: unknown) {
        if (error instanceof GroqUnavailableError) {
          console.error(`[classification] provider error: ${error.message}`);
          // A 4xx other than rate limiting will not improve on retry.
          const status = error.status;
          if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
            return { ok: false, reason: "provider_unavailable", attempts };
          }
          lastReason = "provider_unavailable";
          continue;
        }
        console.error(
          `[classification] unexpected error: ${
            error instanceof Error ? error.name : "UnknownError"
          }`,
        );
        return { ok: false, reason: "provider_unavailable", attempts };
      }
    }

    return { ok: false, reason: lastReason, attempts };
  }
}

/** Reports honestly rather than assigning a department when no model is available. */
class UnconfiguredClassificationProvider implements ClassificationProvider {
  readonly id = "unconfigured";
  readonly isConfigured = false;

  classify(): Promise<ClassificationResult> {
    return Promise.resolve({ ok: false, reason: "provider_not_configured", attempts: 0 });
  }
}

export function resolveClassificationProvider(): ClassificationProvider {
  const groq = new GroqClassificationProvider();
  return groq.isConfigured ? groq : new UnconfiguredClassificationProvider();
}
