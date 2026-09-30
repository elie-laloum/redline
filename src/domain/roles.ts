export const ROLE_NAMES = [
  "functional-grill",
  "scope-scout",
  "technical-grill",
  "planner",
  "test-writer",
  "appeal-arbiter",
  "test-adversary",
  "red-checker",
  "developer",
  "code-adversary",
  "memory-planner",
  "finalizer",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];
