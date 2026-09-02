/**
 * TanStack Start server functions for complaint intake.
 *
 * The only bridge between the browser and the grievance logic. Server modules
 * load via dynamic `import()` inside each handler so the MongoDB driver, the
 * Groq client and `GROQ_API_KEY` access never enter the client module graph.
 *
 * Neither function accepts a citizenId, department, priority or status. Ownership
 * comes from the session; routing is decided server-side.
 */
import { createServerFn } from "@tanstack/react-start";

import type {
  ListMyComplaintsResult,
  MyComplaintSummary,
  SubmitComplaintResult,
  TranscribeResult,
} from "./server/grievance.server";

/**
 * Re-exported so the route can type a row without importing a server-only
 * module. Type-only, so nothing is emitted into the client bundle.
 */
export type { MyComplaintSummary };

/**
 * Uploads recorded audio for transcription.
 *
 * FormData rather than JSON so the audio is sent as binary instead of being
 * base64-inflated by a third. Returns a draft id; the transcript is also kept
 * server-side and re-read at submit time so it cannot be forged.
 */
export const transcribeVoiceFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<TranscribeResult> => {
    const { transcribeVoiceComplaint } = await import("./server/grievance.server");

    if (!(data instanceof FormData)) return { ok: false, error: "audio_unsupported" };
    const file = data.get("audio");
    if (!(file instanceof File)) return { ok: false, error: "audio_unsupported" };

    const audio = new Uint8Array(await file.arrayBuffer());
    return transcribeVoiceComplaint({
      audio,
      mimeType: file.type === "" ? "audio/webm" : file.type,
    });
  });

/**
 * Validates, classifies and persists the grievance.
 * Requires an authenticated CITIZEN session; rejected server-side otherwise.
 */
export const submitComplaintFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<SubmitComplaintResult> => {
    const { submitComplaint } = await import("./server/grievance.server");
    return submitComplaint(data);
  });

/**
 * Lists the signed-in citizen's own complaints.
 *
 * Takes no input by design — ownership is resolved from the session cookie
 * server-side, so there is no citizenId a caller could substitute.
 */
export const listMyComplaintsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListMyComplaintsResult> => {
    const { listMyComplaints } = await import("./server/grievance.server");
    return listMyComplaints();
  },
);
