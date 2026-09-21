// Bunny.net Storage API client.
// https://docs.bunny.net/reference/put_-storagezonename-path-filename
import env from "../config.js";
import { BunnyUploadError } from "../errors.js";

const STORAGE_API = `https://${env.BUNNY_STORAGE_HOST}/${env.BUNNY_STORAGE_ZONE}`;

// Keeps only safe path characters and blocks directory traversal.
export function sanitizeStoragePath(rawPath: string): string {
  const cleaned = rawPath
    .split("/")
    .map(seg => seg.trim())
    .filter(seg => seg.length > 0 && seg !== "." && seg !== "..")
    .join("/")
    .replace(/[^a-zA-Z0-9._\-/]/g, "_");
  if (!cleaned) throw new BunnyUploadError("empty or invalid storage path");
  return cleaned;
}

export interface UploadResult {
  storagePath: string;
  cdnUrl:      string;
  sizeBytes:   number;
}

export async function uploadToBunny(storagePath: string, body: Buffer): Promise<UploadResult> {
  const url = `${STORAGE_API}/${storagePath}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "AccessKey":     env.BUNNY_STORAGE_PASSWORD,
      "Content-Type":  "application/octet-stream",
    },
    body: body as unknown as BodyInit, // Buffer satisfies BodyInit at runtime; @types/node vs lib.dom ArrayBufferLike variance disagrees
  });

  if (res.status !== 201) {
    const text = await res.text().catch(() => "");
    throw new BunnyUploadError(`${res.status} ${text.slice(0, 200)}`);
  }

  return {
    storagePath,
    cdnUrl:    `${env.BUNNY_PULL_ZONE_URL.replace(/\/+$/, "")}/${storagePath}`,
    sizeBytes: body.length,
  };
}
