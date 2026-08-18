export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'STUDENT' | 'ADMIN';
  tenantId: string;
}

export interface RequestWithUser {
  user: AuthenticatedUser;
}
