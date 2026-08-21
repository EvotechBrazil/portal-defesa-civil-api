export const AUDIT_EVENT = {
  ROLE_CHANGED: 'user.role.changed',
  PASSWORD_RESET_ISSUED: 'user.password_reset.issued',
} as const;

export type AuditEvent = (typeof AUDIT_EVENT)[keyof typeof AUDIT_EVENT];
