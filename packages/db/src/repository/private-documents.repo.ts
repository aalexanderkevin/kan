import { and, desc, eq, isNull } from "drizzle-orm";

import { privateDocuments, users } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

import type { PrivateFilesDb } from "./private-files.repo";

export async function list(db: PrivateFilesDb, roomId: number) {
  return db
    .select({
      publicId: privateDocuments.publicId,
      title: privateDocuments.title,
      updatedAt: privateDocuments.updatedAt,
      updatedBy: users.name,
    })
    .from(privateDocuments)
    .leftJoin(users, eq(users.id, privateDocuments.updatedBy))
    .where(
      and(
        eq(privateDocuments.roomId, roomId),
        isNull(privateDocuments.deletedAt),
      ),
    )
    .orderBy(desc(privateDocuments.updatedAt), desc(privateDocuments.id));
}

export async function get(
  db: PrivateFilesDb,
  roomId: number,
  publicId: string,
) {
  const [document] = await db
    .select()
    .from(privateDocuments)
    .where(
      and(
        eq(privateDocuments.roomId, roomId),
        eq(privateDocuments.publicId, publicId),
        isNull(privateDocuments.deletedAt),
      ),
    );
  return document;
}

export async function create(
  db: PrivateFilesDb,
  roomId: number,
  userId: string,
  title: string,
  content: string,
) {
  const [document] = await db
    .insert(privateDocuments)
    .values({
      publicId: generateUID(),
      roomId,
      title,
      content,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();
  if (!document) throw new Error("Failed to create document");
  return document;
}

export async function update(
  db: PrivateFilesDb,
  documentId: number,
  version: number,
  userId: string,
  values: { title?: string; content?: string; deletedAt?: Date },
) {
  const [document] = await db
    .update(privateDocuments)
    .set({
      ...values,
      version: version + 1,
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(
      and(
        eq(privateDocuments.id, documentId),
        eq(privateDocuments.version, version),
        isNull(privateDocuments.deletedAt),
      ),
    )
    .returning();
  return document;
}
