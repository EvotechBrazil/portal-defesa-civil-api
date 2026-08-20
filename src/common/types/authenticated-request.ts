import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  tenantId: string;
}

export interface RequestWithUser {
  user: AuthenticatedUser;
}
