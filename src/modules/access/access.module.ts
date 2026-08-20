import { Module } from '@nestjs/common';
import { ManadasModule } from '../manadas/manadas.module';
import { AccessAdminController } from './access.admin.controller';
import { AccessController } from './access.controller';
import { AccessRepository } from './access.repository';
import { AccessService } from './access.service';

@Module({
  imports: [ManadasModule],
  controllers: [AccessController, AccessAdminController],
  providers: [AccessService, AccessRepository],
  exports: [AccessService],
})
export class AccessModule {}
