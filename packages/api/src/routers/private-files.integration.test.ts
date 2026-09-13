import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { generateOpenApiDocument } from "trpc-to-openapi";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { dbClient } from "@kan/db/client";
import type * as sharedUtils from "@kan/shared/utils";
import * as schema from "@kan/db/schema";
import {
  createPrivateDownloadUrl,
  createPrivateUploadUrl,
  deleteObject,
  generateUID,
  inspectPrivateUpload,
  sealPrivateUpload,
} from "@kan/shared/utils";

import { createInnerTRPCContext } from "../trpc";
import { privateFilesRouter } from "./private-files";

vi.mock("@kan/auth/server", () => ({ initAuth: vi.fn() }));
vi.mock("@kan/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@kan/shared/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof sharedUtils>()),
  createPrivateUploadUrl: vi.fn(),
  inspectPrivateUpload: vi.fn(),
  sealPrivateUpload: vi.fn(),
  createPrivateDownloadUrl: vi.fn(),
  deleteObject: vi.fn(),
}));

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("Missing test fixture");
  return value;
}

let client: PGlite;
let db: dbClient;
beforeAll(async () => {
  client = new PGlite({ extensions: { uuid_ossp, pg_trgm } });
  const database = drizzle(client, { schema });
  await migrate(database, { migrationsFolder: "../db/migrations" });
  db = database as unknown as dbClient;
}, 60000);
afterAll(async () => {
  await client.close();
  vi.unstubAllEnvs();
});

async function fixture(tx: dbClient) {
  const people = await Promise.all(
    ["owner", "editor", "viewer", "admin", "guest", "outsider"].map(
      async (name) => {
        const [user] = await tx
          .insert(schema.users)
          .values({
            id: randomUUID(),
            name,
            email: `${name}@example.test`,
            emailVerified: true,
          })
          .returning();
        return must(user);
      },
    ),
  );
  const [workspace] = await tx
    .insert(schema.workspaces)
    .values({
      publicId: generateUID(),
      name: "Workspace",
      slug: generateUID(),
      createdBy: must(people[0]).id,
    })
    .returning();
  const members = await Promise.all(
    people.slice(0, 5).map(async (user) => {
      const [member] = await tx
        .insert(schema.workspaceMembers)
        .values({
          publicId: generateUID(),
          email: user.email,
          userId: user.id,
          workspaceId: must(workspace).id,
          createdBy: must(people[0]).id,
          role:
            user.name === "guest"
              ? "guest"
              : user.name === "admin"
                ? "admin"
                : "member",
          status: "active",
        })
        .returning();
      return must(member);
    }),
  );
  const callers = people.map((user) =>
    privateFilesRouter.createCaller(
      createInnerTRPCContext({
        db: tx,
        user: { ...user, name: must(user.name) },
        auth: {} as never,
        headers: new Headers(),
      }),
    ),
  );
  const [owner, editor, viewer, admin, guest, outsider] = callers;
  const scope = { workspacePublicId: must(workspace).publicId };
  const room = await must(owner).create({ ...scope, name: "Secret documents" });
  const input = { ...scope, roomPublicId: room.publicId };
  await must(owner).setMember({
    ...input,
    memberPublicId: must(members[1]).publicId,
    role: "editor",
  });
  await must(owner).setMember({
    ...input,
    memberPublicId: must(members[2]).publicId,
    role: "viewer",
  });
  return {
    people,
    members,
    workspace: must(workspace),
    owner: must(owner),
    editor: must(editor),
    viewer: must(viewer),
    admin: must(admin),
    guest: must(guest),
    outsider: must(outsider),
    input,
    scope,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function scenario(
  title: string,
  run: (tx: dbClient, f: Fixture) => Promise<void>,
) {
  it(title, async () => {
    vi.clearAllMocks();
    vi.stubEnv("PRIVATE_FILES_BUCKET_NAME", "private-test-bucket");
    vi.mocked(createPrivateUploadUrl).mockResolvedValue(
      "https://storage.example.test/upload",
    );
    vi.mocked(inspectPrivateUpload).mockResolvedValue({
      size: 123,
      contentType: "application/pdf",
      etag: '"etag"',
    });
    vi.mocked(sealPrivateUpload).mockResolvedValue(undefined);
    vi.mocked(createPrivateDownloadUrl).mockResolvedValue(
      "https://storage.example.test/download",
    );
    vi.mocked(deleteObject).mockResolvedValue(undefined);
    const rollback = new Error("rollback test");
    try {
      await db.transaction(async (transaction) => {
        const tx = transaction as unknown as dbClient;
        await run(tx, await fixture(tx));
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
}
async function upload(f: Fixture) {
  const reservation = await f.editor.prepareUpload({
    ...f.input,
    filename: "important.pdf",
    contentType: "application/pdf",
    size: 123,
  });
  const input = { ...f.input, filePublicId: reservation.filePublicId };
  await f.editor.confirmUpload(input);
  return input;
}

describe("private files: migrated database and tRPC authorization", () => {
  scenario(
    "documents work without S3, persist rich text, and expose only public metadata",
    async (_tx, f) => {
      vi.stubEnv("PRIVATE_FILES_BUCKET_NAME", "");
      const created = await f.editor.createDocument({
        ...f.input,
        title: "Team handbook",
      });
      const input = { ...f.input, documentPublicId: created.publicId };
      const initial = await f.viewer.getDocument(input);
      expect(initial.version).toBe(1);
      const content = JSON.stringify({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "Welcome" }],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Our notes", marks: [{ type: "bold" }] },
            ],
          },
        ],
      });
      await f.editor.updateDocument({
        ...input,
        version: 1,
        title: "Updated handbook",
        content,
      });
      const document = await f.viewer.getDocument(input);
      expect(document.title).toBe("Updated handbook");
      expect(document.content).toBe(content);
      expect(document.version).toBe(2);
      expect(Object.keys(document).sort()).toEqual([
        "content",
        "publicId",
        "role",
        "roomName",
        "title",
        "updatedAt",
        "version",
      ]);
      const listing = await f.viewer.listDocuments(f.input);
      expect(listing).toHaveLength(1);
      expect(Object.keys(must(listing[0])).sort()).toEqual([
        "publicId",
        "title",
        "updatedAt",
        "updatedBy",
      ]);
      expect(createPrivateUploadUrl).not.toHaveBeenCalled();
    },
  );
  scenario(
    "document mutations reject viewers while admin and outsiders cannot discover documents",
    async (_tx, f) => {
      const created = await f.owner.createDocument({
        ...f.input,
        title: "Secret",
      });
      const input = { ...f.input, documentPublicId: created.publicId };
      const document = await f.owner.getDocument(input);
      await expect(
        f.viewer.createDocument({ ...f.input, title: "No" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        f.viewer.updateDocument({
          ...input,
          title: "No",
          content: document.content,
          version: 1,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        f.viewer.deleteDocument({ ...input, version: 1 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      for (const caller of [f.admin, f.outsider, f.guest]) {
        await expect(caller.listDocuments(f.input)).rejects.toMatchObject({
          code: "NOT_FOUND",
        });
        await expect(caller.getDocument(input)).rejects.toMatchObject({
          code: "NOT_FOUND",
        });
      }
    },
  );
  scenario(
    "stale saves and deletes cannot overwrite a newer document",
    async (_tx, f) => {
      const created = await f.editor.createDocument({
        ...f.input,
        title: "Original",
      });
      const input = { ...f.input, documentPublicId: created.publicId };
      const initial = await f.owner.getDocument(input);
      await f.editor.updateDocument({
        ...input,
        version: 1,
        title: "Editor changes",
        content: initial.content,
      });
      await expect(
        f.owner.updateDocument({
          ...input,
          version: 1,
          title: "Stale changes",
          content: initial.content,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        f.owner.deleteDocument({ ...input, version: 1 }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await f.owner.getDocument(input)).title).toBe("Editor changes");
    },
  );
  scenario(
    "document access is isolated by room and revoked with workspace membership",
    async (tx, f) => {
      const created = await f.owner.createDocument({
        ...f.input,
        title: "Secret",
      });
      const input = { ...f.input, documentPublicId: created.publicId };
      const other = await f.admin.create({ ...f.scope, name: "Other room" });
      await expect(
        f.admin.getDocument({ ...input, roomPublicId: other.publicId }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await tx
        .update(schema.workspaceMembers)
        .set({ status: "paused" })
        .where(eq(schema.workspaceMembers.id, must(f.members[1]).id));
      await expect(f.editor.getDocument(input)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await tx
        .update(schema.workspaceMembers)
        .set({ status: "active" })
        .where(eq(schema.workspaceMembers.id, must(f.members[1]).id));
      await expect(f.editor.listDocuments(f.input)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    },
  );
  scenario(
    "soft deleted documents and rooms cannot be read or edited and produce private activity",
    async (tx, f) => {
      const created = await f.editor.createDocument({
        ...f.input,
        title: "Notes",
      });
      const input = { ...f.input, documentPublicId: created.publicId };
      const document = await f.viewer.getDocument(input);
      await f.editor.deleteDocument({ ...input, version: 1 });
      expect(await f.viewer.listDocuments(f.input)).toEqual([]);
      await expect(f.owner.getDocument(input)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(
        f.editor.updateDocument({
          ...input,
          version: 1,
          title: "Revive",
          content: document.content,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const [stored] = await tx
        .select()
        .from(schema.privateDocuments)
        .where(eq(schema.privateDocuments.publicId, created.publicId));
      expect(must(stored).deletedAt).not.toBeNull();
      const events = await tx
        .select()
        .from(schema.privateFileActivities)
        .where(
          eq(schema.privateFileActivities.subjectPublicId, created.publicId),
        );
      expect(events.map((event) => event.action)).toEqual([
        "document.created",
        "document.deleted",
      ]);
      const second = await f.owner.createDocument({
        ...f.input,
        title: "Another",
      });
      await f.owner.deleteRoom(f.input);
      await expect(
        f.viewer.getDocument({ ...f.input, documentPublicId: second.publicId }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    },
  );
  scenario(
    "failed document activity rolls back the saved content and revision",
    async (tx, f) => {
      const created = await f.owner.createDocument({
        ...f.input,
        title: "Original",
      });
      const input = { ...f.input, documentPublicId: created.publicId };
      const document = await f.owner.getDocument(input);
      await tx.execute(
        sql`CREATE FUNCTION reject_test_document_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'document.updated' THEN RAISE EXCEPTION 'Activity failed'; END IF; RETURN NEW; END; $$;`,
      );
      await tx.execute(
        sql`CREATE TRIGGER reject_test_document_activity BEFORE INSERT ON private_file_activity FOR EACH ROW EXECUTE FUNCTION reject_test_document_activity();`,
      );
      await expect(
        f.owner.updateDocument({
          ...input,
          version: 1,
          title: "Changed",
          content: document.content,
        }),
      ).rejects.toThrow();
      expect((await f.owner.getDocument(input)).title).toBe("Original");
      expect((await f.owner.getDocument(input)).version).toBe(1);
    },
  );

  it("exports valid OpenAPI documentation for every private-file procedure", () => {
    const document = generateOpenApiDocument(privateFilesRouter, {
      title: "Private files",
      version: "1",
      baseUrl: "https://example.test/api",
    });
    expect(must(document.paths)["/private-files/rooms"]).toHaveProperty("get");
    expect(
      must(document.paths)[
        "/private-files/rooms/{roomPublicId}/files/{filePublicId}/download"
      ],
    ).toHaveProperty("post");
  });
  scenario(
    "unauthenticated callers cannot list or create rooms",
    async (tx, f) => {
      const anonymous = privateFilesRouter.createCaller(
        createInnerTRPCContext({
          db: tx,
          user: null,
          auth: {} as never,
          headers: new Headers(),
        }),
      );
      await expect(anonymous.list(f.scope)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(
        anonymous.create({ ...f.scope, name: "Secret" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    },
  );
  scenario(
    "failed ownership activity rolls back both role changes",
    async (tx, f) => {
      await tx.execute(sql`CREATE FUNCTION reject_test_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action = 'room.owner.transferred' THEN RAISE EXCEPTION 'Test activity failure'; END IF;
        RETURN NEW;
      END;
    $$;`);
      await tx.execute(
        sql`CREATE TRIGGER reject_test_transfer BEFORE INSERT ON private_file_activity FOR EACH ROW EXECUTE FUNCTION reject_test_transfer();`,
      );
      await expect(
        f.owner.transferOwner({
          ...f.input,
          memberPublicId: must(f.members[1]).publicId,
        }),
      ).rejects.toThrow();
      expect((await f.owner.byId(f.input)).role).toBe("owner");
      expect((await f.editor.byId(f.input)).role).toBe("editor");
    },
  );

  scenario(
    "lists only granted rooms; admins and outsiders cannot discover room metadata",
    async (_tx, f) => {
      expect(await f.owner.list(f.scope)).toHaveLength(1);
      expect(await f.editor.list(f.scope)).toHaveLength(1);
      expect(await f.admin.list(f.scope)).toEqual([]);
      expect(await f.guest.list(f.scope)).toEqual([]);
      await expect(f.admin.byId(f.input)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(f.outsider.byId(f.input)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(f.outsider.list(f.scope)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(
        Object.keys(must((await f.owner.list(f.scope))[0])).sort(),
      ).toEqual(["createdAt", "name", "publicId", "role"]);
    },
  );
  scenario(
    "guests cannot create but can download after an explicit grant",
    async (_tx, f) => {
      await expect(
        f.guest.create({ ...f.scope, name: "Guest room" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await f.owner.setMember({
        ...f.input,
        memberPublicId: must(f.members[4]).publicId,
        role: "viewer",
      });
      const file = await upload(f);
      expect(await f.guest.download(file)).toEqual({
        url: "https://storage.example.test/download",
      });
    },
  );
  scenario(
    "viewers cannot modify files or access; editors cannot manage rooms",
    async (_tx, f) => {
      const file = await upload(f);
      await expect(
        f.viewer.prepareUpload({
          ...f.input,
          filename: "a.pdf",
          contentType: "application/pdf",
          size: 123,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(f.viewer.deleteFile(file)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      for (const caller of [f.viewer, f.editor]) {
        await expect(
          caller.rename({ ...f.input, name: "Changed" }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(caller.deleteRoom(f.input)).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
        await expect(caller.members(f.input)).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
        await expect(
          caller.setMember({
            ...f.input,
            memberPublicId: must(f.members[3]).publicId,
            role: "editor",
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      await f.viewer.download(file);
    },
  );
  scenario(
    "pending files stay hidden, confirmation belongs to uploader, and output contains only public metadata",
    async (_tx, f) => {
      const reservation = await f.editor.prepareUpload({
        ...f.input,
        filename: "a.pdf",
        contentType: "application/pdf",
        size: 123,
      });
      const file = { ...f.input, filePublicId: reservation.filePublicId };
      expect((await f.owner.byId(f.input)).files).toEqual([]);
      await expect(f.owner.confirmUpload(file)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(f.viewer.download(file)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await f.editor.confirmUpload(file);
      await f.editor.confirmUpload(file);
      expect(sealPrivateUpload).toHaveBeenCalledTimes(1);
      expect(deleteObject).toHaveBeenCalledTimes(1);
      const output = must((await f.viewer.byId(f.input)).files[0]);
      expect(Object.keys(output).sort()).toEqual([
        "contentType",
        "createdAt",
        "filename",
        "publicId",
        "size",
        "uploadedBy",
      ]);
      expect(output.filename).toBe("a.pdf");
      expect(must(vi.mocked(sealPrivateUpload).mock.calls[0])[1]).toMatch(
        /^pending\//,
      );
      expect(must(vi.mocked(sealPrivateUpload).mock.calls[0])[2]).toMatch(
        /^files\//,
      );
    },
  );
  scenario(
    "validates file size, filenames, actual object metadata, and expiration",
    async (tx, f) => {
      const base = {
        ...f.input,
        filename: "a.pdf",
        contentType: "application/pdf",
        size: 123,
      };
      for (const size of [0, -1, 50 * 1024 * 1024 + 1, 1.5])
        await expect(
          f.editor.prepareUpload({ ...base, size }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        f.editor.prepareUpload({ ...base, filename: "../a.pdf" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const reservation = await f.editor.prepareUpload(base);
      const file = { ...f.input, filePublicId: reservation.filePublicId };
      vi.mocked(inspectPrivateUpload).mockResolvedValueOnce({
        size: 124,
        contentType: "application/pdf",
        etag: '"etag"',
      });
      await expect(f.editor.confirmUpload(file)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      vi.mocked(inspectPrivateUpload).mockResolvedValueOnce({
        size: 123,
        contentType: "text/html",
        etag: '"etag"',
      });
      await expect(f.editor.confirmUpload(file)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(sealPrivateUpload).not.toHaveBeenCalled();
      await tx
        .update(schema.privateFiles)
        .set({ expiresAt: new Date(0) })
        .where(eq(schema.privateFiles.publicId, reservation.filePublicId));
      await expect(f.editor.confirmUpload(file)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    },
  );
  scenario(
    "revoked editors cannot confirm previously prepared uploads",
    async (_tx, f) => {
      const reservation = await f.editor.prepareUpload({
        ...f.input,
        filename: "a.pdf",
        contentType: "application/pdf",
        size: 123,
      });
      await f.owner.removeMember({
        ...f.input,
        memberPublicId: must(f.members[1]).publicId,
      });
      await expect(
        f.editor.confirmUpload({
          ...f.input,
          filePublicId: reservation.filePublicId,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(inspectPrivateUpload).not.toHaveBeenCalled();
    },
  );
  scenario(
    "changing an editor to viewer blocks an in-flight upload and file deletion",
    async (_tx, f) => {
      const reservation = await f.editor.prepareUpload({
        ...f.input,
        filename: "a.pdf",
        contentType: "application/pdf",
        size: 123,
      });
      await f.owner.setMember({
        ...f.input,
        memberPublicId: must(f.members[1]).publicId,
        role: "viewer",
      });
      await expect(
        f.editor.confirmUpload({
          ...f.input,
          filePublicId: reservation.filePublicId,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );
  scenario(
    "pausing and reactivating members never restores their grants",
    async (tx, f) => {
      await tx
        .update(schema.workspaceMembers)
        .set({ status: "paused" })
        .where(eq(schema.workspaceMembers.id, must(f.members[1]).id));
      await expect(f.editor.byId(f.input)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await tx
        .update(schema.workspaceMembers)
        .set({ status: "active" })
        .where(eq(schema.workspaceMembers.id, must(f.members[1]).id));
      expect(await f.editor.list(f.scope)).toEqual([]);
      await expect(f.editor.byId(f.input)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      const events = await tx
        .select()
        .from(schema.privateFileActivities)
        .where(
          eq(
            schema.privateFileActivities.action,
            "member.workspace_access_revoked",
          ),
        );
      expect(events).toHaveLength(1);
      await f.owner.setMember({
        ...f.input,
        memberPublicId: must(f.members[1]).publicId,
        role: "viewer",
      });
      expect((await f.editor.byId(f.input)).role).toBe("viewer");
    },
  );
  scenario(
    "soft deletion, removal, and changing the workspace member identity revoke grants",
    async (tx, f) => {
      await tx
        .update(schema.workspaceMembers)
        .set({ deletedAt: new Date() })
        .where(eq(schema.workspaceMembers.id, must(f.members[1]).id));
      await tx
        .update(schema.workspaceMembers)
        .set({ deletedAt: null })
        .where(eq(schema.workspaceMembers.id, must(f.members[1]).id));
      expect(await f.editor.list(f.scope)).toEqual([]);
      await tx
        .update(schema.workspaceMembers)
        .set({ status: "removed" })
        .where(eq(schema.workspaceMembers.id, must(f.members[2]).id));
      await tx
        .update(schema.workspaceMembers)
        .set({ status: "active" })
        .where(eq(schema.workspaceMembers.id, must(f.members[2]).id));
      expect(await f.viewer.list(f.scope)).toEqual([]);
      await tx
        .update(schema.workspaceMembers)
        .set({ userId: must(f.people[5]).id })
        .where(eq(schema.workspaceMembers.id, must(f.members[0]).id));
      expect(await f.outsider.list(f.scope)).toEqual([]);
    },
  );
  scenario(
    "transfers ownership atomically and disallows removing or demoting the current owner",
    async (tx, f) => {
      await expect(
        f.owner.removeMember({
          ...f.input,
          memberPublicId: must(f.members[0]).publicId,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        f.owner.setMember({
          ...f.input,
          memberPublicId: must(f.members[0]).publicId,
          role: "editor",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        f.owner.transferOwner({
          ...f.input,
          memberPublicId: must(f.members[3]).publicId,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect((await f.owner.byId(f.input)).role).toBe("owner");
      await f.owner.transferOwner({
        ...f.input,
        memberPublicId: must(f.members[1]).publicId,
      });
      expect((await f.owner.byId(f.input)).role).toBe("editor");
      expect((await f.editor.byId(f.input)).role).toBe("owner");
      await expect(
        f.owner.rename({ ...f.input, name: "Changed" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await f.editor.rename({ ...f.input, name: "Changed" });
      const events = await tx
        .select()
        .from(schema.privateFileActivities)
        .where(
          eq(schema.privateFileActivities.action, "room.owner.transferred"),
        );
      expect(events).toHaveLength(1);
    },
  );
  scenario(
    "an owner leaving never gives the workspace admin access or changes remaining member rights",
    async (tx, f) => {
      await tx
        .update(schema.workspaceMembers)
        .set({ status: "removed" })
        .where(eq(schema.workspaceMembers.id, must(f.members[0]).id));
      await expect(f.owner.byId(f.input)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(f.admin.byId(f.input)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect((await f.editor.byId(f.input)).role).toBe("editor");
      await tx
        .update(schema.workspaceMembers)
        .set({ status: "active" })
        .where(eq(schema.workspaceMembers.id, must(f.members[0]).id));
      await expect(f.owner.byId(f.input)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    },
  );
  scenario(
    "room and workspace boundaries prevent forged file and member IDs",
    async (tx, f) => {
      const file = await upload(f);
      const otherRoom = await f.admin.create({
        ...f.scope,
        name: "Other room",
      });
      await expect(
        f.admin.download({ ...file, roomPublicId: otherRoom.publicId }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        f.viewer.download({ ...file, filePublicId: generateUID() }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const [otherWorkspace] = await tx
        .insert(schema.workspaces)
        .values({ publicId: generateUID(), name: "Other", slug: generateUID() })
        .returning();
      const [otherMember] = await tx
        .insert(schema.workspaceMembers)
        .values({
          publicId: generateUID(),
          email: "outside@example.test",
          userId: must(f.people[5]).id,
          workspaceId: must(otherWorkspace).id,
          createdBy: must(f.people[0]).id,
          role: "member",
          status: "active",
        })
        .returning();
      await expect(
        f.owner.setMember({
          ...f.input,
          memberPublicId: must(otherMember).publicId,
          role: "viewer",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        f.owner.byId({
          ...f.input,
          workspacePublicId: must(otherWorkspace).publicId,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(createPrivateDownloadUrl).not.toHaveBeenCalled();
    },
  );
  scenario(
    "deletion denies access even when object cleanup fails, and records activities",
    async (tx, f) => {
      const file = await upload(f);
      vi.mocked(deleteObject).mockRejectedValueOnce(
        new Error("Storage unavailable"),
      );
      await expect(f.editor.deleteFile(file)).resolves.toEqual({
        success: true,
      });
      await expect(f.viewer.download(file)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect((await f.owner.byId(f.input)).files).toEqual([]);
      const events = await tx
        .select()
        .from(schema.privateFileActivities)
        .where(eq(schema.privateFileActivities.action, "file.deleted"));
      expect(events).toHaveLength(1);
      const second = await upload(f);
      await f.owner.deleteRoom(f.input);
      await expect(f.viewer.download(second)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(await f.owner.list(f.scope)).toEqual([]);
    },
  );
  scenario("deleted workspaces deny all room/file access", async (tx, f) => {
    const file = await upload(f);
    await tx
      .update(schema.workspaces)
      .set({ deletedAt: new Date() })
      .where(eq(schema.workspaces.id, f.workspace.id));
    await expect(f.owner.list(f.scope)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(f.viewer.download(file)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  scenario(
    "storage failures never publish files and missing configuration does not affect existing reads",
    async (_tx, f) => {
      const reservation = await f.editor.prepareUpload({
        ...f.input,
        filename: "a.pdf",
        contentType: "application/pdf",
        size: 123,
      });
      vi.mocked(sealPrivateUpload).mockRejectedValueOnce(
        new Error("Copy failed"),
      );
      await expect(
        f.editor.confirmUpload({
          ...f.input,
          filePublicId: reservation.filePublicId,
        }),
      ).rejects.toThrow();
      expect((await f.owner.byId(f.input)).files).toEqual([]);
      vi.stubEnv("PRIVATE_FILES_BUCKET_NAME", "");
      expect((await f.owner.byId(f.input)).storageConfigured).toBe(false);
      await expect(
        f.editor.prepareUpload({
          ...f.input,
          filename: "a.pdf",
          contentType: "application/pdf",
          size: 123,
        }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    },
  );
});
