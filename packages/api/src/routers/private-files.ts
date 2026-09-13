import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { dbClient } from "@kan/db/client";
import * as documentRepo from "@kan/db/repository/private-documents.repo";
import * as repo from "@kan/db/repository/private-files.repo";
import { createLogger } from "@kan/logger";
import {
  createPrivateDownloadUrl,
  createPrivateUploadUrl,
  deleteObject,
  generateUID,
  inspectPrivateUpload,
  sealPrivateUpload,
} from "@kan/shared/utils";

import {
  EMPTY_DOCUMENT,
  privateDocumentContent,
} from "../schemas/private-document";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertUserInWorkspace } from "../utils/auth";

const logger = createLogger("private-files");
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const publicId = z.string().length(12);
const workspaceInput = z.object({ workspacePublicId: publicId });
const roomInput = workspaceInput.extend({ roomPublicId: publicId });
const fileInput = roomInput.extend({ filePublicId: publicId });
const documentInput = roomInput.extend({ documentPublicId: publicId });
const documentVersionInput = documentInput.extend({
  version: z.number().int().positive(),
});
const documentOutput = z.object({
  publicId,
  title: z.string(),
  content: z.string(),
  version: z.number().int(),
  updatedAt: z.date(),
});
const memberInput = roomInput.extend({ memberPublicId: publicId });
const name = z.string().trim().min(1).max(255);
const role = z.enum(["owner", "editor", "viewer"]);
const success = z.object({ success: z.boolean() });
const roomOutput = z.object({
  publicId,
  name: z.string(),
  role,
  createdAt: z.date(),
});
const notFound = () =>
  new TRPCError({
    code: "NOT_FOUND",
    message: "Private room or file not found",
  });

function procedure(
  summary: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
) {
  return protectedProcedure
    .use(({ ctx, next }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      return next({ ctx: { ...ctx, user: ctx.user } });
    })
    .meta({
      openapi: {
        summary,
        method,
        path: `/private-files${path}`,
        tags: ["Private files"],
        protect: true,
      },
    });
}

async function requireWorkspace(
  db: dbClient,
  userId: string,
  workspacePublicId: string,
  lock = false,
) {
  const access = await repo.getWorkspaceMember(
    db,
    userId,
    workspacePublicId,
    lock,
  );
  if (!access) throw notFound();
  try {
    await assertUserInWorkspace(db, userId, access.workspace.id);
  } catch (error) {
    if (error instanceof TRPCError && error.code === "FORBIDDEN")
      throw notFound();
    throw error;
  }
  return access;
}

// Serialize room changes and lock the actor's workspace membership so revocation
// cannot commit between an authorization check and a write/download grant.
async function withRoom<T>(
  db: dbClient,
  userId: string,
  input: z.infer<typeof roomInput>,
  permission: "read" | "edit" | "owner",
  action: (
    tx: dbClient,
    room: NonNullable<Awaited<ReturnType<typeof repo.getRoom>>>,
    access: Awaited<ReturnType<typeof requireWorkspace>>,
    grant: NonNullable<Awaited<ReturnType<typeof repo.getGrant>>>,
  ) => Promise<T>,
) {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as dbClient;
    const initialAccess = await requireWorkspace(
      tx,
      userId,
      input.workspacePublicId,
    );
    const room = await repo.getRoom(
      tx,
      initialAccess.workspace.id,
      input.roomPublicId,
      true,
    );
    if (!room) throw notFound();
    const access = await requireWorkspace(
      tx,
      userId,
      input.workspacePublicId,
      true,
    );
    const grant = await repo.getGrant(tx, room.id, access.member.id);
    if (!grant) throw notFound();
    if (
      (permission === "owner" && grant.role !== "owner") ||
      (permission === "edit" && grant.role === "viewer")
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action",
      });
    }
    return action(tx, room, access, grant);
  });
}

async function cleanObject(bucket: string, key: string) {
  try {
    await deleteObject(bucket, key);
  } catch (error) {
    logger.error(
      { err: error, bucket, key },
      "Private file cleanup failed; retry storage cleanup",
    );
  }
}

export const privateFilesRouter = createTRPCRouter({
  listDocuments: procedure(
    "List private room documents",
    "GET",
    "/rooms/{roomPublicId}/documents",
  )
    .input(roomInput)
    .output(
      z.array(
        z.object({
          publicId,
          title: z.string(),
          updatedAt: z.date(),
          updatedBy: z.string().nullable(),
        }),
      ),
    )
    .query(({ ctx, input }) =>
      withRoom(ctx.db, ctx.user.id, input, "read", (tx, room) =>
        documentRepo.list(tx, room.id),
      ),
    ),
  createDocument: procedure(
    "Create a private document",
    "POST",
    "/rooms/{roomPublicId}/documents",
  )
    .input(roomInput.extend({ title: name }))
    .output(z.object({ publicId }))
    .mutation(({ ctx, input }) =>
      withRoom(ctx.db, ctx.user.id, input, "edit", async (tx, room) => {
        const document = await documentRepo.create(
          tx,
          room.id,
          ctx.user.id,
          input.title,
          EMPTY_DOCUMENT,
        );
        await repo.activity(
          tx,
          room.id,
          ctx.user.id,
          "document.created",
          document.publicId,
        );
        return { publicId: document.publicId };
      }),
    ),
  getDocument: procedure(
    "Read a private document",
    "GET",
    "/rooms/{roomPublicId}/documents/{documentPublicId}",
  )
    .input(documentInput)
    .output(documentOutput.extend({ role, roomName: z.string() }))
    .query(({ ctx, input }) =>
      withRoom(
        ctx.db,
        ctx.user.id,
        input,
        "read",
        async (tx, room, _access, grant) => {
          const document = await documentRepo.get(
            tx,
            room.id,
            input.documentPublicId,
          );
          if (!document) throw notFound();
          return {
            publicId: document.publicId,
            title: document.title,
            content: document.content,
            version: document.version,
            updatedAt: document.updatedAt,
            role: grant.role,
            roomName: room.name,
          };
        },
      ),
    ),
  updateDocument: procedure(
    "Save a private document",
    "PATCH",
    "/rooms/{roomPublicId}/documents/{documentPublicId}",
  )
    .input(
      documentVersionInput.extend({
        title: name,
        content: privateDocumentContent,
      }),
    )
    .output(documentOutput)
    .mutation(({ ctx, input }) =>
      withRoom(ctx.db, ctx.user.id, input, "edit", async (tx, room) => {
        const existing = await documentRepo.get(
          tx,
          room.id,
          input.documentPublicId,
        );
        if (!existing) throw notFound();
        const document = await documentRepo.update(
          tx,
          existing.id,
          input.version,
          ctx.user.id,
          { title: input.title, content: input.content },
        );
        if (!document)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This document has changed. Reload the latest version before saving.",
          });
        await repo.activity(
          tx,
          room.id,
          ctx.user.id,
          "document.updated",
          document.publicId,
        );
        return {
          publicId: document.publicId,
          title: document.title,
          content: document.content,
          version: document.version,
          updatedAt: document.updatedAt,
        };
      }),
    ),
  deleteDocument: procedure(
    "Delete a private document",
    "DELETE",
    "/rooms/{roomPublicId}/documents/{documentPublicId}",
  )
    .input(documentVersionInput)
    .output(success)
    .mutation(({ ctx, input }) =>
      withRoom(ctx.db, ctx.user.id, input, "edit", async (tx, room) => {
        const existing = await documentRepo.get(
          tx,
          room.id,
          input.documentPublicId,
        );
        if (!existing) throw notFound();
        const document = await documentRepo.update(
          tx,
          existing.id,
          input.version,
          ctx.user.id,
          { deletedAt: new Date() },
        );
        if (!document)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This document has changed. Reload the latest version before deleting.",
          });
        await repo.activity(
          tx,
          room.id,
          ctx.user.id,
          "document.deleted",
          document.publicId,
        );
        return { success: true };
      }),
    ),

  list: procedure("List accessible private rooms", "GET", "/rooms")
    .input(workspaceInput)
    .output(z.array(roomOutput))
    .query(async ({ ctx, input }) => {
      const access = await requireWorkspace(
        ctx.db,
        ctx.user.id,
        input.workspacePublicId,
      );
      return repo.listRooms(ctx.db, access.workspace.id, access.member.id);
    }),
  create: procedure("Create a private room", "POST", "/rooms")
    .input(workspaceInput.extend({ name }))
    .output(z.object({ publicId }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (transaction) => {
        const tx = transaction as unknown as dbClient;
        const access = await requireWorkspace(
          tx,
          ctx.user.id,
          input.workspacePublicId,
          true,
        );
        if (access.member.role === "guest")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Guests cannot create private rooms",
          });
        const room = await repo.createRoom(
          tx,
          access.workspace.id,
          access.member.id,
          ctx.user.id,
          input.name,
        );
        return { publicId: room.publicId };
      });
    }),
  byId: procedure(
    "Get a private room and its files",
    "GET",
    "/rooms/{roomPublicId}",
  )
    .input(roomInput)
    .output(
      roomOutput.extend({
        storageConfigured: z.boolean(),
        files: z.array(
          z.object({
            publicId,
            filename: z.string(),
            contentType: z.string(),
            size: z.number(),
            createdAt: z.date(),
            uploadedBy: z.string().nullable(),
          }),
        ),
      }),
    )
    .query(({ ctx, input }) =>
      withRoom(
        ctx.db,
        ctx.user.id,
        input,
        "read",
        async (tx, room, _access, grant) => ({
          publicId: room.publicId,
          name: room.name,
          createdAt: room.createdAt,
          role: grant.role,
          storageConfigured: !!process.env.PRIVATE_FILES_BUCKET_NAME,
          files: await repo.listFiles(tx, room.id),
        }),
      ),
    ),
  rename: procedure("Rename a private room", "PATCH", "/rooms/{roomPublicId}")
    .input(roomInput.extend({ name }))
    .output(success)
    .mutation(({ ctx, input }) =>
      withRoom(ctx.db, ctx.user.id, input, "owner", async (tx, room) => {
        await repo.updateRoom(tx, room.id, { name: input.name });
        await repo.activity(tx, room.id, ctx.user.id, "room.renamed");
        return { success: true };
      }),
    ),
  deleteRoom: procedure(
    "Delete a private room",
    "DELETE",
    "/rooms/{roomPublicId}",
  )
    .input(roomInput)
    .output(success)
    .mutation(({ ctx, input }) =>
      withRoom(ctx.db, ctx.user.id, input, "owner", async (tx, room) => {
        await repo.updateRoom(tx, room.id, { deletedAt: new Date() });
        await repo.activity(tx, room.id, ctx.user.id, "room.deleted");
        return { success: true };
      }),
    ),
  members: procedure(
    "List private room members and available workspace members",
    "GET",
    "/rooms/{roomPublicId}/members",
  )
    .input(roomInput)
    .output(
      z.object({
        members: z.array(
          z.object({
            memberPublicId: publicId,
            name: z.string().nullable(),
            role,
          }),
        ),
        candidates: z.array(
          z.object({ memberPublicId: publicId, name: z.string().nullable() }),
        ),
      }),
    )
    .query(({ ctx, input }) =>
      withRoom(
        ctx.db,
        ctx.user.id,
        input,
        "owner",
        async (tx, room, access) => ({
          members: await repo.listMembers(tx, room.id),
          candidates: await repo.listCandidates(tx, access.workspace.id),
        }),
      ),
    ),
  setMember: procedure(
    "Grant or change private room access",
    "POST",
    "/rooms/{roomPublicId}/members",
  )
    .input(memberInput.extend({ role: z.enum(["viewer", "editor"]) }))
    .output(success)
    .mutation(({ ctx, input }) =>
      withRoom(
        ctx.db,
        ctx.user.id,
        input,
        "owner",
        async (tx, room, access) => {
          const member = await repo.getActiveMember(
            tx,
            access.workspace.id,
            input.memberPublicId,
          );
          if (!member) throw notFound();
          const existing = await repo.getGrant(tx, room.id, member.id);
          if (existing?.role === "owner")
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Transfer ownership before changing the owner's access",
            });
          await repo.setGrant(tx, room.id, member.id, ctx.user.id, input.role);
          await repo.activity(
            tx,
            room.id,
            ctx.user.id,
            `member.${input.role}`,
            input.memberPublicId,
          );
          return { success: true };
        },
      ),
    ),
  removeMember: procedure(
    "Revoke private room access",
    "DELETE",
    "/rooms/{roomPublicId}/members/{memberPublicId}",
  )
    .input(memberInput)
    .output(success)
    .mutation(({ ctx, input }) =>
      withRoom(
        ctx.db,
        ctx.user.id,
        input,
        "owner",
        async (tx, room, access) => {
          const member = await repo.getActiveMember(
            tx,
            access.workspace.id,
            input.memberPublicId,
          );
          if (!member) throw notFound();
          const grant = await repo.getGrant(tx, room.id, member.id);
          if (!grant) throw notFound();
          if (grant.role === "owner")
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Transfer ownership before removing the owner",
            });
          await repo.revokeGrant(tx, room.id, member.id);
          await repo.activity(
            tx,
            room.id,
            ctx.user.id,
            "member.removed",
            input.memberPublicId,
          );
          return { success: true };
        },
      ),
    ),
  transferOwner: procedure(
    "Transfer private room ownership",
    "POST",
    "/rooms/{roomPublicId}/owner",
  )
    .input(memberInput)
    .output(success)
    .mutation(({ ctx, input }) =>
      withRoom(
        ctx.db,
        ctx.user.id,
        input,
        "owner",
        async (tx, room, access) => {
          const member = await repo.getActiveMember(
            tx,
            access.workspace.id,
            input.memberPublicId,
          );
          if (!member) throw notFound();
          const grant = await repo.getGrant(tx, room.id, member.id);
          if (!grant || member.id === access.member.id)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Choose another active room member",
            });
          await repo.setGrant(
            tx,
            room.id,
            access.member.id,
            ctx.user.id,
            "editor",
          );
          await repo.setGrant(tx, room.id, member.id, ctx.user.id, "owner");
          await repo.activity(
            tx,
            room.id,
            ctx.user.id,
            "room.owner.transferred",
            input.memberPublicId,
          );
          return { success: true };
        },
      ),
    ),
  prepareUpload: procedure(
    "Prepare a private file upload",
    "POST",
    "/rooms/{roomPublicId}/uploads",
  )
    .input(
      roomInput.extend({
        filename: name.refine(
          (value) =>
            Array.from(value).every(
              (character) =>
                character.charCodeAt(0) >= 32 &&
                character.charCodeAt(0) !== 127 &&
                character !== "/" &&
                character !== "\\",
            ),
          "Invalid filename",
        ),
        contentType: z
          .string()
          .min(1)
          .max(255)
          .regex(/^[\w.+-]+\/[\w.+-]+$/),
        size: z.number().int().positive().max(MAX_FILE_SIZE),
      }),
    )
    .output(z.object({ filePublicId: publicId, url: z.string().url() }))
    .mutation(({ ctx, input }) =>
      withRoom(ctx.db, ctx.user.id, input, "edit", async (tx, room, access) => {
        const bucket = process.env.PRIVATE_FILES_BUCKET_NAME;
        if (!bucket)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Private file storage is not configured",
          });
        const filePublicId = generateUID();
        const storageKey = `pending/${access.workspace.publicId}/${room.publicId}/${filePublicId}/${generateUID()}`;
        const url = await createPrivateUploadUrl(
          bucket,
          storageKey,
          input.contentType,
          input.size,
        );
        await repo.reserveFile(tx, {
          publicId: filePublicId,
          roomId: room.id,
          filename: input.filename,
          contentType: input.contentType,
          size: input.size,
          bucket,
          storageKey,
          createdBy: ctx.user.id,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });
        return { filePublicId, url };
      }),
    ),
  confirmUpload: procedure(
    "Confirm a private file upload",
    "POST",
    "/rooms/{roomPublicId}/files/{filePublicId}/confirm",
  )
    .input(fileInput)
    .output(success)
    .mutation(async ({ ctx, input }) => {
      const result = await withRoom(
        ctx.db,
        ctx.user.id,
        input,
        "edit",
        async (tx, room, access) => {
          const file = await repo.getFile(tx, room.id, input.filePublicId);
          if (!file || file.createdBy !== ctx.user.id) throw notFound();
          if (file.confirmedAt) return null;
          if (file.expiresAt.getTime() <= Date.now())
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Upload expired; please upload the file again",
            });
          let uploaded;
          try {
            uploaded = await inspectPrivateUpload(file.bucket, file.storageKey);
          } catch {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Upload not found; please retry the upload",
            });
          }
          if (
            uploaded.size !== file.size ||
            uploaded.size > MAX_FILE_SIZE ||
            uploaded.contentType !== file.contentType ||
            !uploaded.etag
          )
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Uploaded file does not match the upload reservation",
            });
          const finalKey = `files/${access.workspace.publicId}/${room.publicId}/${file.publicId}/${generateUID()}`;
          await sealPrivateUpload(
            file.bucket,
            file.storageKey,
            finalKey,
            uploaded.etag,
          );
          await repo.updateFile(tx, file.id, {
            storageKey: finalKey,
            confirmedAt: new Date(),
          });
          await repo.activity(
            tx,
            room.id,
            ctx.user.id,
            "file.uploaded",
            file.publicId,
          );
          return { bucket: file.bucket, key: file.storageKey };
        },
      );
      if (result) await cleanObject(result.bucket, result.key);
      return { success: true };
    }),
  download: procedure(
    "Create a short-lived private file download",
    "POST",
    "/rooms/{roomPublicId}/files/{filePublicId}/download",
  )
    .input(fileInput)
    .output(z.object({ url: z.string().url() }))
    .mutation(({ ctx, input }) =>
      withRoom(ctx.db, ctx.user.id, input, "read", async (tx, room) => {
        const file = await repo.getFile(tx, room.id, input.filePublicId);
        if (!file?.confirmedAt) throw notFound();
        return {
          url: await createPrivateDownloadUrl(
            file.bucket,
            file.storageKey,
            file.filename,
          ),
        };
      }),
    ),
  deleteFile: procedure(
    "Delete a private file",
    "DELETE",
    "/rooms/{roomPublicId}/files/{filePublicId}",
  )
    .input(fileInput)
    .output(success)
    .mutation(async ({ ctx, input }) => {
      const file = await withRoom(
        ctx.db,
        ctx.user.id,
        input,
        "edit",
        async (tx, room) => {
          const file = await repo.getFile(tx, room.id, input.filePublicId);
          if (!file?.confirmedAt) throw notFound();
          await repo.updateFile(tx, file.id, { deletedAt: new Date() });
          await repo.activity(
            tx,
            room.id,
            ctx.user.id,
            "file.deleted",
            file.publicId,
          );
          return file;
        },
      );
      await cleanObject(file.bucket, file.storageKey);
      return { success: true };
    }),
});
