/**
 * TanStack Start server functions for complaint evidence and duplicate warnings.
 *
 * The only bridge between the browser and these features. Server modules load via
 * dynamic `import()` inside each handler, so the MongoDB driver, the Cloudinary
 * SDK, `CLOUDINARY_API_SECRET` and `GROQ_API_KEY` never enter the client module
 * graph.
 *
 * None of these functions accepts a citizenId. Ownership always comes from the
 * session cookie, so there is no identity field a caller could substitute.
 */
import { createServerFn } from "@tanstack/react-start";

import type { RelatedComplaint } from "./validation/duplicate";
import type {
  DiscardEvidenceResult,
  GetEvidenceResult,
  UploadEvidenceResult,
} from "./server/evidence.server";

export type { RelatedComplaint };

/**
 * Uploads one photograph and holds it as a draft.
 *
 * FormData rather than JSON so the image travels as binary instead of being
 * inflated by a third as base64. The image is validated by content, re-encoded to
 * strip EXIF and GPS, and stored as a non-public Cloudinary asset — all
 * server-side. There is no unsigned browser upload path.
 */
export const uploadEvidenceFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<UploadEvidenceResult> => {
    const { uploadEvidenceDraft } = await import("./server/evidence.server");

    if (!(data instanceof FormData)) return { ok: false, error: "evidence_not_an_image" };
    const file = data.get("image");
    if (!(file instanceof File)) return { ok: false, error: "evidence_not_an_image" };

    return uploadEvidenceDraft({
      bytes: new Uint8Array(await file.arrayBuffer()),
      // Advisory. The server determines the real format from the bytes.
      mimeType: file.type,
      fileName: file.name,
    });
  });

/** Removes a photograph the citizen attached but then decided against. */
export const discardEvidenceFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<DiscardEvidenceResult> => {
    const { discardEvidenceDraft } = await import("./server/evidence.server");
    const draftId =
      typeof data === "object" && data !== null
        ? (data as { draftId?: unknown }).draftId
        : undefined;
    return discardEvidenceDraft(draftId);
  });

/**
 * Returns short-lived signed URLs for a grievance's photographs.
 *
 * Authorization happens server-side against the session before any URL is
 * generated. A grievance owned by another citizen returns the same "not found" as
 * one that does not exist, so grievance numbers cannot be probed.
 */
export const getEvidenceUrlsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<GetEvidenceResult> => {
    const { getEvidenceUrls } = await import("./server/evidence.server");
    const grievanceId =
      typeof data === "object" && data !== null
        ? (data as { grievanceId?: unknown }).grievanceId
        : undefined;
    return getEvidenceUrls(grievanceId);
  });

/**
 * Advisory duplicate check, run before the citizen submits.
 *
 * Cheap by construction: candidate retrieval is bounded and filtered, similarity
 * is computed in-process, and no language model is called — so this cannot
 * contribute to a rate limit. Nothing is written.
 *
 * The response carries only `RelatedComplaint` values: a grievance number, a
 * district, a date, a status, a similarity percentage and a relationship code. The
 * browser never receives another citizen's identity, address or complaint text,
 * and never receives the grievance corpus.
 */
export const precheckDuplicatesFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<{ related: RelatedComplaint[] }> => {
    const { precheckDuplicateComplaint } = await import("./server/duplicate-precheck.server");
    return precheckDuplicateComplaint(data);
  });
