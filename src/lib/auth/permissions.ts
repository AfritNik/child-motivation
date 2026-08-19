import { AccessRole } from "../../generated/prisma/client";

export type Permission =
  | "USE_CHILD_MODE"
  | "CONFIRM_DAILY_ACTIONS"
  | "CONFIRM_REWARDS"
  | "VIEW_STUDY"
  | "EDIT_AVERAGES"
  | "SELECT_WEEKLY_MODE"
  | "CORRECT_POINTS";

const permissionsByRole: Record<AccessRole, ReadonlySet<Permission>> = {
  [AccessRole.CHILD]: new Set(["USE_CHILD_MODE"]),
  [AccessRole.ADMIN]: new Set([
    "CONFIRM_DAILY_ACTIONS",
    "CONFIRM_REWARDS",
    "VIEW_STUDY",
    "EDIT_AVERAGES",
    "SELECT_WEEKLY_MODE",
    "CORRECT_POINTS",
  ]),
  [AccessRole.ADULT]: new Set([
    "CONFIRM_DAILY_ACTIONS",
    "CONFIRM_REWARDS",
    "VIEW_STUDY",
  ]),
};

export function hasPermission(
  role: AccessRole,
  permission: Permission,
): boolean {
  return permissionsByRole[role].has(permission);
}
