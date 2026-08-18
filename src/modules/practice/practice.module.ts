import { Module } from '@nestjs/common';
import { PracticeController } from './practice.controller';
import { PracticeRepository } from './practice.repository';
import { PracticeService } from './practice.service';

@Module({
  controllers: [PracticeController],
  providers: [PracticeService, PracticeRepository],
  exports: [PracticeService],
})
export class PracticeModule {}
