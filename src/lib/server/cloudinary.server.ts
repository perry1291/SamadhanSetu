/**
 * Server-only Cloudinary client for complaint evidence.
 *
 * SECURITY CONTRACT:
 *  - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` are
 *    read from `process.env` only. None is `VITE_`-prefixed, and this module
 *    carries the server-only marker, so importing it from a component fails the
 *    build. Uploads are signed server-side; there is no unsigned browser upload.
 *  - Assets are stored as `type: "authenticated"`. Cloudinary will not serve them
 *    from a plain delivery URL, so knowing a public id is not enough to read an
 *    image. Retrieval requires a short-lived signed URL minted here, and callers
 *    must perform the ownership check before asking for one.
 *  - Public ids and folders contain only a grievance number and random suffixes.
 *    No citizen name, mobile, email or address is ever placed in a storage key.
 *  - Secrets are never logged, returned, or included in an error. Failures are
 *    reduced to a reason code.
 */
import "@tanstack/react-start/server-only";

import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

import { EVIDENCE_URL_TTL_SECONDS, type ImageFormat } from "@/lib/validation/evidence";

export const CLOUDINARY_PROVIDER = "cloudinary";

/** Root folder. Complaint assets live under a per-grievance subfolder. */
const ROOT_FOLDER = "samadhan-setu/complaints";
/** Holding area for images uploaded before the grievance number exists. */
const DRAFT_FOLDER = `${ROOT_FOLDER}/_drafts`;

export type CloudinaryFailureReason =
  "provider_not_configured" | "upload_failed" | "not_found" | "provider_error";

export class CloudinaryUnavailableError extends Error {
  readonly reason: CloudinaryFailureReason;
  constructor(reason: CloudinaryFailureReason) {
    super(`Cloudinary request failed: ${reason}`);
    this.name = "CloudinaryUnavailableError";
    this.reason = reason;
  }
}

interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

function readCredentials(): CloudinaryCredentials | undefined {
  const read = (key: string): string | undefined => {
    const value = process.env[key];
    return value !== undefined && value.trim() !== "" ? value.trim() : undefined;
  };

  let cloudName = read("CLOUDINARY_CLOUD_NAME");
  let apiKey = read("CLOUDINARY_API_KEY");
  let apiSecret = read("CLOUDINARY_API_SECRET");

  // Dev convenience, mirroring db.server.ts: load the project env file when the
  // process was not started with it. No-op in production.
  if (
    (cloudName === undefined || apiKey === undefined || apiSecret === undefined) &&
    typeof process.loadEnvFile === "function"
  ) {
    for (const file of [".env.local", ".env"]) {
      try {
        process.loadEnvFile(file);
      } catch {
        // Absent file is the normal production case.
      }
    }
    cloudName ??= read("CLOUDINARY_CLOUD_NAME");
    apiKey ??= read("CLOUDINARY_API_KEY");
    apiSecret ??= read("CLOUDINARY_API_SECRET");
  }

  if (cloudName === undefined || apiKey === undefined || apiSecret === undefined) return undefined;
  return { cloudName, apiKey, apiSecret };
}

let configured = false;

function configure(): CloudinaryCredentials {
  const credentials = readCredentials();
  if (credentials === undefined) throw new CloudinaryUnavailableError("provider_not_configured");
  if (!configured) {
    cloudinary.config({
      cloud_name: credentials.cloudName,
      api_key: credentials.apiKey,
      api_secret: credentials.apiSecret,
      secure: true,
    });
    configured = true;
  }
  return credentials;
}

/** Whether credentials are present, without revealing them. */
export function isCloudinaryConfigured(): boolean {
  return readCredentials() !== undefined;
}

/** Random, non-identifying asset name. */
function randomAssetName(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Grievance numbers contain slashes (`GRV/2026/0000042`), which Cloudinary would
 * interpret as extra folder levels. Flattening keeps one folder per grievance.
 */
function grievanceFolderSegment(grievanceId: string): string {
  return grievanceId.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export interface UploadedAsset {
  assetId: string;
  publicId: string;
  format: ImageFormat;
  bytes: number;
  width: number;
  height: number;
}

/**
 * Uploads sanitised bytes into the draft folder.
 *
 * Called before the grievance exists, so the asset is keyed by an opaque draft id
 * and moved once the grievance number is allocated.
 */
export async function uploadDraftEvidence(input: {
  bytes: Uint8Array;
  format: ImageFormat;
  draftId: string;
}): Promise<UploadedAsset> {
  configure();

  try {
    const response = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `${DRAFT_FOLDER}/${input.draftId}`,
          public_id: randomAssetName(),
          // Not publicly deliverable; requires a signed URL to read.
          type: "authenticated",
          resource_type: "image",
          format: input.format,
          // The bytes were already re-encoded locally; no further transformation.
          overwrite: false,
        },
        (error, result) => {
          if (error !== undefined && error !== null) reject(error);
          else if (result === undefined) reject(new Error("empty_upload_response"));
          else resolve(result);
        },
      );
      stream.end(Buffer.from(input.bytes));
    });

    return {
      assetId: response["asset_id"] ?? "",
      publicId: response.public_id,
      format: (response.format === "jpeg" ? "jpg" : response.format) as ImageFormat,
      bytes: response.bytes,
      width: response.width,
      height: response.height,
    };
  } catch (error: unknown) {
    // Reason only. Provider payloads can echo request detail.
    console.error(
      `[cloudinary] upload failed: ${error instanceof Error ? error.name : "UnknownError"}`,
    );
    throw new CloudinaryUnavailableError("upload_failed");
  }
}

/**
 * Moves a draft asset into `samadhan-setu/complaints/{grievanceId}/`.
 *
 * Returns the new public id, or `undefined` when the move fails. A failed move is
 * not fatal: the asset remains readable at its draft id, which the caller keeps,
 * so the citizen's evidence is never lost to a housekeeping error.
 */
export async function moveEvidenceToGrievance(input: {
  publicId: string;
  grievanceId: string;
}): Promise<string | undefined> {
  configure();
  const target = `${ROOT_FOLDER}/${grievanceFolderSegment(input.grievanceId)}/${
    input.publicId.split("/").pop() ?? randomAssetName()
  }`;

  try {
    const renamed = await cloudinary.uploader.rename(input.publicId, target, {
      type: "authenticated",
      resource_type: "image",
      overwrite: false,
    });
    return renamed.public_id;
  } catch (error: unknown) {
    console.error(
      `[cloudinary] rename failed: ${error instanceof Error ? error.name : "UnknownError"}`,
    );
    return undefined;
  }
}

/**
 * Mints a signed delivery URL for an authenticated asset.
 *
 * PURELY local computation — no network call, so it is cheap and cannot fail
 * because of provider availability. The caller MUST have verified that the
 * requester is authorised to see this grievance before calling.
 *
 * Produces `.../image/authenticated/s--SIGNATURE--/v1/<public_id>.<fmt>`. Two
 * properties matter:
 *
 *  - The asset is `type: "authenticated"`, so the bare path is not deliverable.
 *    Guessing a public id gets a 401, not an image.
 *  - The signature is computed over the public id. Editing the path to point at a
 *    different asset invalidates the signature, so one citizen's URL cannot be
 *    rewritten into another citizen's evidence.
 *
 * `cloudinary.utils.private_download_url` was the alternative. It supports a hard
 * `expires_at`, but it addresses the API download endpoint, returns
 * `Content-Disposition: attachment` so it will not render in an `<img>`, and
 * embeds `api_key` in the query string. A signed delivery URL keeps the key out
 * of the URL and renders inline.
 *
 * HONEST LIMITATION: signed delivery URLs are not themselves time-limited.
 * Cloudinary time-limits delivery through auth tokens, which are a paid add-on
 * this account may not have. What bounds exposure here is that the URL is issued
 * only after a server-side ownership check, and that it cannot be re-pointed at
 * another asset. `EVIDENCE_URL_TTL_SECONDS` is therefore how long a caller should
 * cache the value, not a provider-enforced expiry.
 */
export function signedEvidenceUrl(input: { publicId: string; format: ImageFormat }): string {
  configure();
  return cloudinary.url(input.publicId, {
    resource_type: "image",
    type: "authenticated",
    format: input.format,
    sign_url: true,
    secure: true,
  });
}

/**
 * Deletes an asset. Used to clean up when a later step fails, so a rejected
 * submission does not leave orphaned images in storage.
 */
export async function deleteEvidenceAsset(publicId: string): Promise<boolean> {
  if (!isCloudinaryConfigured()) return false;
  try {
    configure();
    const result = await cloudinary.uploader.destroy(publicId, {
      type: "authenticated",
      resource_type: "image",
      invalidate: true,
    });
    return result.result === "ok" || result.result === "not found";
  } catch (error: unknown) {
    console.error(
      `[cloudinary] destroy failed: ${error instanceof Error ? error.name : "UnknownError"}`,
    );
    return false;
  }
}
