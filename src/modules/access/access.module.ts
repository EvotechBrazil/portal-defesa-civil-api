import { Module } from '@nestjs/common';
import { AccessAdminController } from './access.admin.controller';
import { AccessController } from './access.controller';
import { AccessRepository } from './access.repository';
import { AccessService } from './access.service';

@Module({
  controllers: [AccessController, AccessAdminController],
  providers: [AccessService, AccessRepository],
  exports: [AccessService],
})
export class AccessModule {}
