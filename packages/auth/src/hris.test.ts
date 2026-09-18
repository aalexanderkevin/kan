import { describe, expect, it } from "vitest";

import { isEligible } from "./hris";

const allowedCompanyId = "2ksILJeMfKv0JR6WLjiKYsDKr6F";
const eligibleUser = {
  employeeId: "CM11EMP87",
  employeeName: "Employee",
  passwordHash: "$2a$12$placeholder",
  companyId: allowedCompanyId,
  isActive: true,
  needResetPassword: false,
  userAccessId: null,
  userAccessStatus: null,
};

describe("isEligible", () => {
  it("allows an active employee in the configured company", () => {
    expect(isEligible(eligibleUser, allowedCompanyId)).toBe(true);
  });

  it.each([
    ["different company", { companyId: "another-company" }],
    ["inactive employee", { isActive: false }],
    ["password reset required", { needResetPassword: true }],
    [
      "inactive user access",
      { userAccessId: "access-1", userAccessStatus: false },
    ],
  ])("rejects %s", (_reason, override) => {
    expect(isEligible({ ...eligibleUser, ...override }, allowedCompanyId)).toBe(
      false,
    );
  });
});
