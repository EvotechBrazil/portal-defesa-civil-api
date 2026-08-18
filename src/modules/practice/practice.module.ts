import { Module } from '@nestjs/common';
import { PRACTICE_SHUFFLE } from './practice.constants';
import { PracticeController } from './practice.controller';
import { PracticeRepository } from './practice.repository';
import { PracticeService } from './practice.service';
import { defaultPracticeShuffle } from './practice.shuffle';

@Module({
  controllers: [PracticeController],
  providers: [
    PracticeService,
    PracticeRepository,
    { provide: PRACTICE_SHUFFLE, useValue: defaultPracticeShuffle },
  ],
  exports: [PracticeService],
})
export class PracticeModule {}
