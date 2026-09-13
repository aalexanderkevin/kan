import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users";
import { workspaceMembers, workspaces } from "./workspaces";

export const privateRoomRoleEnum = pgEnum("private_room_role", [
  "owner",
  "editor",
  "viewer",
]);

export const privateRooms = pgTable(
  "private_room",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    workspaceId: bigint("workspaceId", { mode: "number" })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => [index("private_room_workspace_idx").on(table.workspaceId)],
).enableRLS();

export const privateRoomMembers = pgTable(
  "private_room_member",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    roomId: bigint("roomId", { mode: "number" })
      .notNull()
      .references(() => privateRooms.id, { onDelete: "cascade" }),
    workspaceMemberId: bigint("workspaceMemberId", { mode: "number" })
      .notNull()
      .references(() => workspaceMembers.id, { onDelete: "cascade" }),
    role: privateRoomRoleEnum("role").notNull(),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => [
    uniqueIndex("private_room_active_member_idx")
      .on(table.roomId, table.workspaceMemberId)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("private_room_owner_idx")
      .on(table.roomId)
      .where(sql`${table.deletedAt} IS NULL AND ${table.role} = 'owner'`),
    index("private_room_member_workspace_member_idx").on(
      table.workspaceMemberId,
    ),
  ],
).enableRLS();

// A pending row is an upload reservation. Only confirmed rows can be listed or downloaded.
export const privateFiles = pgTable(
  "private_file",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    roomId: bigint("roomId", { mode: "number" })
      .notNull()
      .references(() => privateRooms.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 255 }).notNull(),
    contentType: varchar("contentType", { length: 255 }).notNull(),
    size: integer("size").notNull(),
    bucket: text("bucket").notNull(),
    storageKey: text("storageKey").notNull().unique(),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    confirmedAt: timestamp("confirmedAt"),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => [index("private_file_room_idx").on(table.roomId)],
).enableRLS();

export const privateFileActivities = pgTable(
  "private_file_activity",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    roomId: bigint("roomId", { mode: "number" })
      .notNull()
      .references(() => privateRooms.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 80 }).notNull(),
    subjectPublicId: varchar("subjectPublicId", { length: 12 }),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("private_file_activity_room_idx").on(table.roomId)],
).enableRLS();

export const privateDocuments = pgTable(
  "private_document",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    publicId: varchar("publicId", { length: 12 }).notNull().unique(),
    roomId: bigint("roomId", { mode: "number" })
      .notNull()
      .references(() => privateRooms.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    version: integer("version").notNull().default(1),
    createdBy: uuid("createdBy").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: uuid("updatedBy").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => [index("private_document_room_idx").on(table.roomId)],
).enableRLS();
