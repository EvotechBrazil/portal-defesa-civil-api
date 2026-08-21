import { Module } from '@nestjs/common';
import { AuditLogRepository } from './audit-log.repository';
import { UsersAdminController } from './users.admin.controller';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, UsersAdminController],
  providers: [UsersService, UsersRepository, AuditLogRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
