import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as notificationRepo from "@kan/db/repository/notification.repo";

import { createTRPCRouter, protectedProcedure } from "../trpc";

const notificationSchema = z.object({
  publicId: z.string(),
  type: z.string(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
  card: z
    .object({
      publicId: z.string(),
      title: z.string(),
    })
    .nullable(),
});

const getUserId = (userId: string | undefined) => {
  if (!userId) {
    throw new TRPCError({
      message: "User not authenticated",
      code: "UNAUTHORIZED",
    });
  }

  return userId;
};

export const notificationRouter = createTRPCRouter({
  list: protectedProcedure
    .meta({
      openapi: {
        summary: "List notifications",
        method: "GET",
        path: "/notifications",
        description: "Lists notifications for the authenticated user",
        tags: ["Notifications"],
        protect: true,
      },
    })
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .output(z.array(notificationSchema))
    .query(async ({ ctx, input }) => {
      const userId = getUserId(ctx.user?.id);
      return notificationRepo.getForUser(ctx.db, { userId, limit: input.limit });
    }),
  unreadCount: protectedProcedure
    .meta({
      openapi: {
        summary: "Get unread notification count",
        method: "GET",
        path: "/notifications/unread-count",
        description: "Gets the unread notification count for the authenticated user",
        tags: ["Notifications"],
        protect: true,
      },
    })
    .output(z.object({ count: z.number() }))
    .query(async ({ ctx }) => {
      const userId = getUserId(ctx.user?.id);
      const count = await notificationRepo.getUnreadCount(ctx.db, userId);
      return { count };
    }),
  markAsRead: protectedProcedure
    .meta({
      openapi: {
        summary: "Mark a notification as read",
        method: "PUT",
        path: "/notifications/{notificationPublicId}/read",
        description: "Marks one notification as read",
        tags: ["Notifications"],
        protect: true,
      },
    })
    .input(z.object({ notificationPublicId: z.string().min(12) }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = getUserId(ctx.user?.id);
      const notification = await notificationRepo.getByPublicIdForUser(ctx.db, {
        notificationPublicId: input.notificationPublicId,
        userId,
      });

      if (!notification) {
        throw new TRPCError({
          message: "Notification not found",
          code: "NOT_FOUND",
        });
      }

      if (!notification.readAt) {
        await notificationRepo.markAsRead(ctx.db, notification.id);
      }

      return { success: true };
    }),
  markAllAsRead: protectedProcedure
    .meta({
      openapi: {
        summary: "Mark all notifications as read",
        method: "PUT",
        path: "/notifications/read-all",
        description: "Marks every notification for the authenticated user as read",
        tags: ["Notifications"],
        protect: true,
      },
    })
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx }) => {
      const userId = getUserId(ctx.user?.id);
      await notificationRepo.markAllAsRead(ctx.db, userId);
      return { success: true };
    }),
});
