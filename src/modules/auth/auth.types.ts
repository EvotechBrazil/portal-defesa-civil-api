import { UserRole } from '@prisma/client';

export interface JwtAccessPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  email: string;
}

export interface RegisterResult {
  id: string;
  email: string;
  name: string;
}

export interface AuthUserView {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUserView;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface VerifyEmailResult {
  verified: true;
}
