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
  /**
   * Falso quando ainda falta provar o e-mail. Com AUTO_VERIFY_EMAIL ligado a
   * conta ja nasce verificada e nenhum e-mail e enviado — o cliente precisa
   * saber disso para nao pedir um codigo que nunca foi gerado.
   */
  emailVerified: boolean;
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

export const FORGOT_PASSWORD_ACK_MESSAGE =
  'Se houver conta com esse e-mail, o link foi enviado.';

export const RESET_PASSWORD_INVALID_MESSAGE = 'Link inválido ou expirado.';

export interface ForgotPasswordResult {
  message: typeof FORGOT_PASSWORD_ACK_MESSAGE;
}

export interface ResetPasswordResult {
  reset: true;
}

export interface AdminPasswordResetResult {
  resetUrl: string;
}
