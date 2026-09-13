import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import {
  privateFileActivities,
  privateFiles,
  privateRoomMembers,
  privateRooms,
  users,
  workspaceMembers,
  workspaces,
} from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export type PrivateFilesDb = Pick<dbClient, "select" | "insert" | "update">;
export type RoomRole = "owner" | "editor" | "viewer";

export async function getWorkspaceMember(
  db: PrivateFilesDb,
  userId: string,
  workspacePublicId: string,
  lock = false,
) {
  const query = db
    .select({ member: workspaceMembers, workspace: workspaces })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaces.publicId, workspacePublicId),
        isNull(workspaces.deletedAt),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, "active"),
        isNull(workspaceMembers.deletedAt),
      ),
    );
  const [result] = await (lock
    ? query.for("update", { of: workspaceMembers })
    : query);
  return result;
}

export async function listRooms(
  db: PrivateFilesDb,
  workspaceId: number,
  memberId: number,
) {
  return db
    .select({
      publicId: privateRooms.publicId,
      name: privateRooms.name,
      role: privateRoomMembers.role,
      createdAt: privateRooms.createdAt,
    })
    .from(privateRooms)
    .innerJoin(
      privateRoomMembers,
      eq(privateRoomMembers.roomId, privateRooms.id),
    )
    .where(
      and(
        eq(privateRooms.workspaceId, workspaceId),
        eq(privateRoomMembers.workspaceMemberId, memberId),
        isNull(privateRooms.deletedAt),
        isNull(privateRoomMembers.deletedAt),
      ),
    )
    .orderBy(desc(privateRooms.createdAt));
}

export async function getRoom(
  db: PrivateFilesDb,
  workspaceId: number,
  publicId: string,
  lock = false,
) {
  const query = db
    .select()
    .from(privateRooms)
    .where(
      and(
        eq(privateRooms.workspaceId, workspaceId),
        eq(privateRooms.publicId, publicId),
        isNull(privateRooms.deletedAt),
      ),
    );
  const [room] = await (lock ? query.for("update") : query);
  return room;
}

export async function getGrant(
  db: PrivateFilesDb,
  roomId: number,
  memberId: number,
) {
  const [grant] = await db
    .select()
    .from(privateRoomMembers)
    .where(
      and(
        eq(privateRoomMembers.roomId, roomId),
        eq(privateRoomMembers.workspaceMemberId, memberId),
        isNull(privateRoomMembers.deletedAt),
      ),
    );
  return grant;
}

export async function activity(
  db: PrivateFilesDb,
  roomId: number,
  userId: string,
  action: string,
  subjectPublicId?: string,
) {
  await db
    .insert(privateFileActivities)
    .values({
      publicId: generateUID(),
      roomId,
      createdBy: userId,
      action,
      subjectPublicId,
    });
}

export async function createRoom(
  db: PrivateFilesDb,
  workspaceId: number,
  memberId: number,
  userId: string,
  name: string,
) {
  const [room] = await db
    .insert(privateRooms)
    .values({ publicId: generateUID(), workspaceId, name, createdBy: userId })
    .returning();
  if (!room) throw new Error("Failed to create private room");
  await db
    .insert(privateRoomMembers)
    .values({
      publicId: generateUID(),
      roomId: room.id,
      workspaceMemberId: memberId,
      role: "owner",
      createdBy: userId,
    });
  await activity(db, room.id, userId, "room.created");
  return room;
}

export async function updateRoom(
  db: PrivateFilesDb,
  roomId: number,
  values: { name?: string; deletedAt?: Date },
) {
  await db
    .update(privateRooms)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(privateRooms.id, roomId));
}

export async function listFiles(db: PrivateFilesDb, roomId: number) {
  return db
    .select({
      publicId: privateFiles.publicId,
      filename: privateFiles.filename,
      contentType: privateFiles.contentType,
      size: privateFiles.size,
      createdAt: privateFiles.createdAt,
      uploadedBy: users.name,
    })
    .from(privateFiles)
    .leftJoin(users, eq(users.id, privateFiles.createdBy))
    .where(
      and(
        eq(privateFiles.roomId, roomId),
        isNull(privateFiles.deletedAt),
        isNotNull(privateFiles.confirmedAt),
      ),
    )
    .orderBy(desc(privateFiles.createdAt));
}

export async function listMembers(db: PrivateFilesDb, roomId: number) {
  return db
    .select({
      memberPublicId: workspaceMembers.publicId,
      name: users.name,
      role: privateRoomMembers.role,
    })
    .from(privateRoomMembers)
    .innerJoin(
      workspaceMembers,
      eq(workspaceMembers.id, privateRoomMembers.workspaceMemberId),
    )
    .leftJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(privateRoomMembers.roomId, roomId),
        isNull(privateRoomMembers.deletedAt),
        isNull(workspaceMembers.deletedAt),
        eq(workspaceMembers.status, "active"),
      ),
    );
}

export async function listCandidates(db: PrivateFilesDb, workspaceId: number) {
  return db
    .select({ memberPublicId: workspaceMembers.publicId, name: users.name })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.status, "active"),
        isNull(workspaceMembers.deletedAt),
      ),
    );
}

export async function getActiveMember(
  db: PrivateFilesDb,
  workspaceId: number,
  publicId: string,
) {
  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.publicId, publicId),
        eq(workspaceMembers.status, "active"),
        isNull(workspaceMembers.deletedAt),
        isNotNull(workspaceMembers.userId),
      ),
    )
    .for("update");
  return member;
}

export async function setGrant(
  db: PrivateFilesDb,
  roomId: number,
  memberId: number,
  userId: string,
  role: RoomRole,
) {
  const existing = await getGrant(db, roomId, memberId);
  if (existing) {
    await db
      .update(privateRoomMembers)
      .set({ role, updatedAt: new Date() })
      .where(eq(privateRoomMembers.id, existing.id));
  } else {
    await db
      .insert(privateRoomMembers)
      .values({
        publicId: generateUID(),
        roomId,
        workspaceMemberId: memberId,
        role,
        createdBy: userId,
      });
  }
}

export async function revokeGrant(
  db: PrivateFilesDb,
  roomId: number,
  memberId: number,
) {
  await db
    .update(privateRoomMembers)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(privateRoomMembers.roomId, roomId),
        eq(privateRoomMembers.workspaceMemberId, memberId),
        isNull(privateRoomMembers.deletedAt),
      ),
    );
}

export async function reserveFile(
  db: PrivateFilesDb,
  values: typeof privateFiles.$inferInsert,
) {
  const [file] = await db.insert(privateFiles).values(values).returning();
  if (!file) throw new Error("Failed to reserve private file");
  return file;
}

export async function getFile(
  db: PrivateFilesDb,
  roomId: number,
  publicId: string,
) {
  const [file] = await db
    .select()
    .from(privateFiles)
    .where(
      and(
        eq(privateFiles.roomId, roomId),
        eq(privateFiles.publicId, publicId),
        isNull(privateFiles.deletedAt),
      ),
    );
  return file;
}

export async function updateFile(
  db: PrivateFilesDb,
  fileId: number,
  values: { storageKey?: string; confirmedAt?: Date; deletedAt?: Date },
) {
  await db.update(privateFiles).set(values).where(eq(privateFiles.id, fileId));
}
