import { Module } from '@nestjs/common';
import { StudyController } from './study.controller';
import { StudyRepository } from './study.repository';
import { StudyService } from './study.service';

@Module({
  controllers: [StudyController],
  providers: [StudyService, StudyRepository],
  exports: [StudyService, StudyRepository],
})
export class StudyModule {}
