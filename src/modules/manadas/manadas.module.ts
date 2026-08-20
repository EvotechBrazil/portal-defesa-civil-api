import { Module } from '@nestjs/common';
import { ManadasController } from './manadas.controller';
import { ManadasRepository } from './manadas.repository';
import { ManadasService } from './manadas.service';

@Module({
  controllers: [ManadasController],
  providers: [ManadasService, ManadasRepository],
  exports: [ManadasService],
})
export class ManadasModule {}
