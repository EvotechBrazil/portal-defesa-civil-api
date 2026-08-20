import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AccessModule } from '../access/access.module';
import { MailModule } from '../mail/mail.module';
import { ManadasModule } from '../manadas/manadas.module';
import { UsersModule } from '../users/users.module';
import { AuthAdminController } from './auth.admin.controller';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    AccessModule,
    MailModule,
    ManadasModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.accessSecret'),
        signOptions: {
          expiresIn: config.getOrThrow<number>('jwt.accessTtlSeconds') || 900,
        },
      }),
    }),
  ],
  controllers: [AuthController, AuthAdminController],
  providers: [AuthService, AuthRepository, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
