import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env, publicEnv } from '@/env';

/**
 * Object storage.
 *
 * Production uses Cloudflare R2 (S3-compatible): multi-writer, CDN-backed, no
 * egress fees, and presigned PUTs so large uploads never pass through the
 * Next.js server. A Railway Volume was rejected deliberately — it is
 * single-writer, forbids replicas, and adds redeploy downtime.
 *
 * When S3_* is unset the layer falls back to the local filesystem so that
 * `npm run dev` works with no cloud account. That fallback is refused in
 * production rather than silently writing to an ephemeral container disk.
 */

export type PutOptions = {
  contentType: string;
  cacheControl?: string;
  /** Public assets are CDN-cacheable; private ones require a signed URL. */
  visibility?: 'public' | 'private';
};

export interface StorageDriver {
  readonly kind: 'r2' | 'local';
  put(key: string, body: Buffer, options: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Time-limited URL for reading a private object. */
  signedGetUrl(key: string, expiresInSeconds?: number): Promise<string>;
  /** Time-limited URL letting the browser upload straight to storage. */
  signedPutUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
  publicUrl(key: string): string;
}

/**
 * Root of the on-disk store.
 *
 * `process.cwd()` is not a stable base in production: the standalone server
 * calls `process.chdir(__dirname)`, so an unconfigured relative default lands
 * inside `.next/standalone` — the directory the next deploy replaces wholesale.
 * Uploads would survive exactly until the following release, which is the worst
 * shape data loss takes: delayed, silent, and discovered by a visitor.
 *
 * Set STORAGE_LOCAL_ROOT to an absolute path on a mounted volume when this
 * driver runs in a deploy.
 */
const LOCAL_ROOT = resolve(env.STORAGE_LOCAL_ROOT ?? join(process.cwd(), '.storage'));

class LocalStorage implements StorageDriver {
  readonly kind = 'local' as const;

  private path(key: string) {
    // Refuse traversal outside the storage root.
    const full = resolve(LOCAL_ROOT, key);
    if (!full.startsWith(LOCAL_ROOT)) throw new Error(`Unsafe storage key: ${key}`);
    return full;
  }

  async put(key: string, body: Buffer) {
    const full = this.path(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string) {
    return readFile(this.path(key));
  }

  async delete(key: string) {
    await unlink(this.path(key)).catch(() => {});
  }

  async signedGetUrl(key: string) {
    return `/api/media/${encodeURI(key)}`;
  }

  async signedPutUrl(): Promise<string> {
    // No direct-to-storage upload locally; the dev route accepts the bytes.
    throw new Error(
      'signedPutUrl is unavailable with local storage. The admin uploads through ' +
        'the uploadMedia server action, which streams the bytes itself.',
    );
  }

  publicUrl(key: string) {
    return `/api/media/${encodeURI(key)}`;
  }
}

class R2Storage implements StorageDriver {
  readonly kind = 'r2' as const;
  private client: S3Client;
  private bucket: string;

  constructor(endpoint: string, bucket: string, accessKeyId: string, secretAccessKey: string) {
    this.bucket = bucket;
    this.client = new S3Client({
      region: env.S3_REGION ?? 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }

  async put(key: string, body: Buffer, options: PutOptions) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        // Derivatives are content-addressed and versioned, so they are
        // immutable and can be cached hard.
        CacheControl: options.cacheControl ?? 'public, max-age=31536000, immutable',
      }),
    );
  }

  async get(key: string) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Object not found: ${key}`);
    return Buffer.from(bytes);
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async signedGetUrl(key: string, expiresInSeconds = 300) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async signedPutUrl(key: string, contentType: string, expiresInSeconds = 300) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );
  }

  publicUrl(key: string) {
    const base = publicEnv.mediaBaseUrl.replace(/\/$/, '');
    return `${base}/${key}`;
  }
}

let cached: StorageDriver | null = null;

/**
 * Select the storage driver.
 *
 * The driver is chosen from explicit configuration, never inferred from
 * NODE_ENV. That heuristic is wrong in exactly the cases that matter: both
 * `next start` and the end-to-end suite run a production build, so a
 * "development means local disk" rule silently refuses to store anything the
 * moment you verify against a real build — which is precisely when you want to.
 *
 * Local disk therefore requires opting in with STORAGE_DRIVER=local. Absent
 * both that and S3 credentials, this throws rather than quietly writing to a
 * container filesystem that Railway discards on the next deploy.
 */
export function storage(): StorageDriver {
  if (cached) return cached;

  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  const s3Configured = Boolean(
    S3_ENDPOINT && S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY,
  );

  if (env.STORAGE_DRIVER === 'local') {
    cached = new LocalStorage();
    return cached;
  }

  if (!s3Configured) {
    throw new Error(
      'Object storage is not configured. Either set S3_ENDPOINT, S3_BUCKET, ' +
        'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or set STORAGE_DRIVER=local ' +
        'to use on-disk storage (development only — Railway discards it).',
    );
  }

  cached = new R2Storage(S3_ENDPOINT!, S3_BUCKET!, S3_ACCESS_KEY_ID!, S3_SECRET_ACCESS_KEY!);
  return cached;
}

/** Content-addressed key. Identical bytes always produce the same key. */
export function buildOriginalKey(checksum: string, extension: string): string {
  return `originals/${checksum.slice(0, 2)}/${checksum}.${extension}`;
}

/**
 * Derivative key.
 *
 * Keyed by content checksum rather than asset id, so identical bytes uploaded
 * twice share derivatives, and so a derivative can be written before the asset
 * row exists. Includes the recipe version, which means bumping the recipe
 * produces a new key rather than overwriting files that live pages still
 * reference.
 */
export function buildDerivativeKey(
  checksum: string,
  recipeVersion: number,
  width: number,
  format: string,
): string {
  return `derivatives/v${recipeVersion}/${checksum.slice(0, 2)}/${checksum}/${width}.${format}`;
}

/** Uploads awaiting a form submission. Reaped after 24h if never attached. */
export function buildUploadKey(extension: string): string {
  return `uploads/${randomUUID()}.${extension}`;
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export { join as joinStorageKey };
