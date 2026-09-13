import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPrivateDownloadUrl,
  createPrivateUploadUrl,
} from "@kan/shared/utils";

afterEach(() => vi.unstubAllEnvs());
function configureStorage() {
  vi.stubEnv("S3_ACCESS_KEY_ID", "test-access-key");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "test-secret-key");
  vi.stubEnv("S3_REGION", "us-east-1");
  vi.stubEnv("S3_ENDPOINT", "https://storage.example.test");
  vi.stubEnv("S3_FORCE_PATH_STYLE", "true");
}

describe("private file storage signatures", () => {
  it("limits download links to 60 seconds and forces a safe non-cacheable attachment", async () => {
    configureStorage();
    const url = new URL(
      await createPrivateDownloadUrl(
        "private-bucket",
        "files/object",
        'résumé\r\n".pdf',
      ),
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(url.searchParams.get("response-content-type")).toBe(
      "application/octet-stream",
    );
    expect(url.searchParams.get("response-cache-control")).toBe(
      "private, no-store",
    );
    const disposition = url.searchParams.get("response-content-disposition");
    expect(disposition).toContain("attachment;");
    expect(disposition).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9__%22.pdf");
    expect(disposition).not.toMatch(/[\r\n]/);
  });
  it("signs the declared upload size and expires the PUT URL in five minutes", async () => {
    configureStorage();
    const url = new URL(
      await createPrivateUploadUrl(
        "private-bucket",
        "pending/object",
        "application/pdf",
        123,
      ),
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain(
      "content-length",
    );
    expect(url.pathname).toBe("/private-bucket/pending/object");
    expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
  });
});
