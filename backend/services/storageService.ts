import fs from 'fs';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import {
  S3_BUCKET,
  S3_REGION,
  S3_ENDPOINT,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_PUBLIC_URL_PREFIX,
  UPLOAD_DIR,
} from '../config.js';
import { isPathSafe } from '../utils/imageSecurity.js';

let s3ClientInstance: S3Client | null = null;
let activeBucket = S3_BUCKET;
let activeRegion = S3_REGION;
let activePublicPrefix = S3_PUBLIC_URL_PREFIX;
let activeEndpoint = S3_ENDPOINT;

/**
 * Determines whether persistent S3/R2 storage is fully configured via environment variables.
 */
export function isS3Configured(): boolean {
  return Boolean(
    s3ClientInstance ||
    (activeBucket && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY)
  );
}

/**
 * Lazily initializes and returns the S3 client instance.
 * Credentials and endpoints are never logged or exposed.
 */
export function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    const config: {
      region: string;
      credentials: {
        accessKeyId: string;
        secretAccessKey: string;
      };
      endpoint?: string;
      forcePathStyle?: boolean;
    } = {
      region: activeRegion || 'auto',
      credentials: {
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY,
      },
    };

    if (activeEndpoint) {
      config.endpoint = activeEndpoint;
      config.forcePathStyle = true;
    }

    s3ClientInstance = new S3Client(config);
  }
  return s3ClientInstance;
}

/**
 * For testing and mocking S3 operations.
 */
export function setS3ClientForTesting(client: S3Client | null): void {
  s3ClientInstance = client;
}

/**
 * Configures mock or temporary S3 parameters for unit tests.
 */
export function setS3ConfigForTesting(config: {
  client?: S3Client | null;
  bucket?: string;
  region?: string;
  publicUrlPrefix?: string;
  endpoint?: string;
} | null): void {
  if (!config) {
    s3ClientInstance = null;
    activeBucket = S3_BUCKET;
    activeRegion = S3_REGION;
    activePublicPrefix = S3_PUBLIC_URL_PREFIX;
    activeEndpoint = S3_ENDPOINT;
    return;
  }
  if (config.client !== undefined) s3ClientInstance = config.client;
  if (config.bucket !== undefined) activeBucket = config.bucket;
  if (config.region !== undefined) activeRegion = config.region;
  if (config.publicUrlPrefix !== undefined) activePublicPrefix = config.publicUrlPrefix;
  if (config.endpoint !== undefined) activeEndpoint = config.endpoint;
}

export interface UploadResult {
  url: string;
  key: string;
  storageType: 's3' | 'local';
}

/**
 * Uploads an image buffer.
 * If S3/R2 is configured, uploads directly to the cloud object store.
 * Otherwise, falls back seamlessly to local ./uploads directory.
 */
export async function uploadImage(
  buffer: Buffer,
  safeFilename: string,
  mimeType: string = 'image/jpeg'
): Promise<UploadResult> {
  if (isS3Configured()) {
    const client = getS3Client();
    const key = `items/${safeFilename}`;
    const bucket = activeBucket || 'campusfind-uploads';
    const region = activeRegion || 'auto';

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    await client.send(command);

    let url: string;
    if (activePublicPrefix) {
      url = `${activePublicPrefix.replace(/\/+$/, '')}/${key}`;
    } else if (activeEndpoint) {
      url = `${activeEndpoint.replace(/\/+$/, '')}/${bucket}/${key}`;
    } else {
      url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    }

    return { url, key, storageType: 's3' };
  }

  // Local fallback:
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  if (!isPathSafe(UPLOAD_DIR, safeFilename)) {
    throw new Error('Unsafe filename rejected.');
  }

  const targetPath = path.join(UPLOAD_DIR, safeFilename);
  fs.writeFileSync(targetPath, buffer);
  const url = `/uploads/${safeFilename}`;

  return { url, key: safeFilename, storageType: 'local' };
}

/**
 * Deletes a stored image, either from S3 or local storage.
 */
export async function deleteImage(imageUrlOrKey: string | null | undefined): Promise<boolean> {
  if (!imageUrlOrKey) return false;
  try {
    if (imageUrlOrKey.startsWith('/uploads/')) {
      const filename = path.basename(imageUrlOrKey);
      if (isPathSafe(UPLOAD_DIR, filename)) {
        const filePath = path.join(UPLOAD_DIR, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          return true;
        }
      }
      return false;
    }

    if (isS3Configured()) {
      const client = getS3Client();
      const bucket = activeBucket || 'campusfind-uploads';
      let key = imageUrlOrKey;
      if (imageUrlOrKey.startsWith('http://') || imageUrlOrKey.startsWith('https://')) {
        try {
          const parsed = new URL(imageUrlOrKey);
          key = parsed.pathname.replace(/^\//, '');
          if (key.startsWith(`${bucket}/`)) {
            key = key.substring(bucket.length + 1);
          }
        } catch {
          // ignore parsing error
        }
      }
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      await client.send(command);
      return true;
    }

    const filename = path.basename(imageUrlOrKey);
    if (isPathSafe(UPLOAD_DIR, filename)) {
      const filePath = path.join(UPLOAD_DIR, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
    }
    return false;
  } catch (err) {
    console.warn('Failed to delete image from storage:', err);
    return false;
  }
}
