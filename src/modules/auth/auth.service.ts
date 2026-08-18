import { Injectable, NotImplementedException } from '@nestjs/common';
import { AuthRepository } from './auth.repository';

@Injectable()
export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}

  register(): never {
    throw new NotImplementedException('AuthService.register');
  }

  verifyEmail(): never {
    throw new NotImplementedException('AuthService.verifyEmail');
  }

  resendVerification(): never {
    throw new NotImplementedException('AuthService.resendVerification');
  }

  login(): never {
    throw new NotImplementedException('AuthService.login');
  }

  refresh(): never {
    throw new NotImplementedException('AuthService.refresh');
  }

  logout(): never {
    throw new NotImplementedException('AuthService.logout');
  }

  me(): never {
    throw new NotImplementedException('AuthService.me');
  }
}
