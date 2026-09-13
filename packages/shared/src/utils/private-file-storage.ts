import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { createS3Client } from "./s3";

export async function createPrivateUploadUrl(
  bucket: string,
  key: string,
  contentType: string,
  size: number,
) {
  return getSignedUrl(
    // The server has no upload body to checksum while signing this browser PUT.
    createS3Client({ requestChecksumCalculation: "WHEN_REQUIRED" }),
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    }),
    { expiresIn: 300 },
  );
}

export async function inspectPrivateUpload(bucket: string, key: string) {
  const result = await createS3Client().send(
    new HeadObjectCommand({ Bucket: bucket, Key: key }),
  );
  return {
    size: result.ContentLength,
    contentType: result.ContentType,
    etag: result.ETag,
  };
}

// Never publish the key covered by a reusable PUT URL. Copy to an immutable key
// and match the inspected ETag so an upload cannot be swapped during confirmation.
export async function sealPrivateUpload(
  bucket: string,
  sourceKey: string,
  destinationKey: string,
  etag: string,
) {
  await createS3Client().send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: destinationKey,
      CopySource: `${bucket}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`,
      CopySourceIfMatch: etag,
      MetadataDirective: "REPLACE",
      ContentType: "application/octet-stream",
      ContentDisposition: "attachment",
    }),
  );
}

export async function createPrivateDownloadUrl(
  bucket: string,
  key: string,
  filename: string,
) {
  const safeName = Array.from(filename, (character) =>
    character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      ? "_"
      : character,
  ).join("");
  const encodedName = encodeURIComponent(safeName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return getSignedUrl(
    createS3Client(),
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: "application/octet-stream",
      ResponseContentDisposition: `attachment; filename="download"; filename*=UTF-8''${encodedName}`,
      ResponseCacheControl: "private, no-store",
    }),
    { expiresIn: 60 },
  );
}
