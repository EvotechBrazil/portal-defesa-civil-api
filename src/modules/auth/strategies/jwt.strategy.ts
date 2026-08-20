import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersRepository } from '../../users/users.repository';
import { AuthenticatedUser } from '../../../common/types/authenticated-request';
import { JwtAccessPayload } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersRepository: UsersRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  /**
   * O `role` do payload e deliberadamente IGNORADO: o papel efetivo vem do
   * banco a cada request. E isso que faz promocao e rebaixamento valerem no
   * request seguinte, sem esperar o access token de 15 min expirar.
   */
  async validate(payload: JwtAccessPayload): Promise<AuthenticatedUser> {
    const user = await this.usersRepository.findActiveById(payload.sub);
    if (!user || user.tenantId !== payload.tenantId) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
  }
}
