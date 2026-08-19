import { AccessRole } from "../../generated/prisma/client";
import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions";

describe("role permissions", () => {
  it("allows Sasha to use only child mode", () => {
    expect(hasPermission(AccessRole.CHILD, "USE_CHILD_MODE")).toBe(true);
    expect(hasPermission(AccessRole.CHILD, "CONFIRM_DAILY_ACTIONS")).toBe(false);
  });

  it("allows Papa to perform every adult action", () => {
    expect(hasPermission(AccessRole.ADMIN, "CONFIRM_DAILY_ACTIONS")).toBe(true);
    expect(hasPermission(AccessRole.ADMIN, "EDIT_AVERAGES")).toBe(true);
    expect(hasPermission(AccessRole.ADMIN, "SELECT_WEEKLY_MODE")).toBe(true);
    expect(hasPermission(AccessRole.ADMIN, "CORRECT_POINTS")).toBe(true);
  });

  it("does not allow Grandpa to edit averages or weekly mode", () => {
    expect(hasPermission(AccessRole.ADULT, "CONFIRM_REWARDS")).toBe(true);
    expect(hasPermission(AccessRole.ADULT, "VIEW_STUDY")).toBe(true);
    expect(hasPermission(AccessRole.ADULT, "EDIT_AVERAGES")).toBe(false);
    expect(hasPermission(AccessRole.ADULT, "SELECT_WEEKLY_MODE")).toBe(false);
    expect(hasPermission(AccessRole.ADULT, "CORRECT_POINTS")).toBe(false);
  });
});
