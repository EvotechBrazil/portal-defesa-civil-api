import { Module } from '@nestjs/common';
import { RoleChangeAuditRepository } from './role-change-audit.repository';
import { UsersAdminController } from './users.admin.controller';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, UsersAdminController],
  providers: [UsersService, UsersRepository, RoleChangeAuditRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
