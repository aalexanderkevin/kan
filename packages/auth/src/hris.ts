import { compare } from "bcryptjs";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { Pool } from "pg";
import { z } from "zod";

import type { dbClient } from "@kan/db/client";
import * as memberRepo from "@kan/db/repository/member.repo";
import * as permissionRepo from "@kan/db/repository/permission.repo";
import * as userRepo from "@kan/db/repository/user.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { createLogger } from "@kan/logger";

const log = createLogger("hris-auth");

const INVALID_CREDENTIALS = "Invalid employee ID or password";

type HrisUser = {
  employeeId: string;
  employeeName: string;
  passwordHash: string;
  companyId: string;
  isActive: boolean | null;
  needResetPassword: boolean | null;
  userAccessId: string | null;
  userAccessStatus: boolean | null;
};

let hrisPool: Pool | undefined;

const getHrisPool = () => {
  const connectionString = process.env.HRIS_DATABASE_URL;
  if (!connectionString) return undefined;

  hrisPool ??= new Pool({ connectionString, max: 5 });
  return hrisPool;
};

const getConfig = () => ({
  allowedCompanyId: process.env.HRIS_ALLOWED_COMPANY_ID,
  bootstrapEmployeeId: process.env.HRIS_BOOTSTRAP_ADMIN_EMPLOYEE_ID,
  bootstrapWorkspacePublicId: process.env.HRIS_BOOTSTRAP_WORKSPACE_PUBLIC_ID,
});

const getHrisUser = async (
  employeeId: string,
): Promise<HrisUser | undefined> => {
  const pool = getHrisPool();
  if (!pool) return undefined;

  const result = await pool.query<HrisUser>(
    `SELECT
       e.id AS "employeeId",
       e.name AS "employeeName",
       u.password AS "passwordHash",
       e.company_id AS "companyId",
       e.is_active AS "isActive",
       u.need_reset_password AS "needResetPassword",
       u.user_access_id AS "userAccessId",
       ua.status AS "userAccessStatus"
     FROM users u
     INNER JOIN employees e ON e.id = u.employee_id
     LEFT JOIN user_accesses ua ON ua.id = u.user_access_id
     WHERE LOWER(u.username) = LOWER($1)
     LIMIT 1`,
    [employeeId],
  );

  return result.rows[0];
};

export const isEligible = (user: HrisUser, allowedCompanyId: string) =>
  user.companyId === allowedCompanyId &&
  user.isActive === true &&
  user.needResetPassword !== true &&
  (user.userAccessId === null || user.userAccessStatus === true);

const getOpaqueEmail = (employeeId: string) =>
  `hris-${Buffer.from(employeeId).toString("base64url").toLowerCase()}@employee.invalid`;

const ensureBootstrapMembership = async (
  db: dbClient,
  employeeId: string,
  user: { id: string; email: string },
) => {
  const { bootstrapEmployeeId, bootstrapWorkspacePublicId } = getConfig();
  if (employeeId !== bootstrapEmployeeId || !bootstrapWorkspacePublicId) {
    return;
  }

  const workspace = await workspaceRepo.getByPublicId(
    db,
    bootstrapWorkspacePublicId,
  );
  if (!workspace || workspace.deletedAt) {
    log.error(
      { workspacePublicId: bootstrapWorkspacePublicId },
      "HRIS bootstrap workspace was not found",
    );
    return;
  }

  const adminRole = await permissionRepo.getRoleByWorkspaceIdAndName(
    db,
    workspace.id,
    "admin",
  );
  if (!adminRole) {
    log.error(
      { workspaceId: workspace.id },
      "Workspace admin role was not found",
    );
    return;
  }

  const existing = await memberRepo.getByWorkspaceIdAndUserId(
    db,
    workspace.id,
    user.id,
  );
  if (existing) {
    await memberRepo.activateAsAdmin(db, existing.id, adminRole.id);
    return;
  }

  await memberRepo.create(db, {
    workspaceId: workspace.id,
    email: user.email,
    userId: user.id,
    createdBy: user.id,
    role: "admin",
    roleId: adminRole.id,
    status: "active",
  });
};

export const hrisEmployeePlugin = (db: dbClient) => ({
  id: "hris-employee-plugin",
  endpoints: {
    signInHris: createAuthEndpoint(
      "/sign-in/hris",
      {
        method: "POST",
        body: z.object({
          employeeId: z.string().trim().min(1).max(255),
          password: z.string().min(1).max(128),
        }),
      },
      async (ctx) => {
        const { allowedCompanyId } = getConfig();
        const pool = getHrisPool();
        if (!pool || !allowedCompanyId) {
          log.error("HRIS authentication is not configured");
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "Authentication is unavailable",
          });
        }

        try {
          const hrisUser = await getHrisUser(ctx.body.employeeId);
          if (
            !hrisUser ||
            !isEligible(hrisUser, allowedCompanyId) ||
            !(await compare(ctx.body.password, hrisUser.passwordHash))
          ) {
            throw new APIError("UNAUTHORIZED", {
              message: INVALID_CREDENTIALS,
            });
          }

          let user = await userRepo.getByHrisEmployeeId(
            db,
            hrisUser.employeeId,
          );
          if (!user) {
            user = await userRepo.createHrisUser(db, {
              hrisEmployeeId: hrisUser.employeeId,
              name: hrisUser.employeeName,
              email: getOpaqueEmail(hrisUser.employeeId),
            });
          }

          if (!user) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Authentication is unavailable",
            });
          }

          await ensureBootstrapMembership(db, hrisUser.employeeId, user);

          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          if (!session) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Authentication is unavailable",
            });
          }

          const sessionUser = {
            ...user,
            name: user.name ?? hrisUser.employeeName,
          };
          await setSessionCookie(ctx, { session, user: sessionUser });
          return ctx.json({
            redirect: false,
            token: session.token,
            user: sessionUser,
          });
        } catch (error) {
          if (error instanceof APIError) throw error;

          log.error({ err: error }, "HRIS authentication failed");
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "Authentication is unavailable",
          });
        }
      },
    ),
  },
});
