import { Module } from '@nestjs/common';
import { DecksController } from './decks.controller';
import { DecksRepository } from './decks.repository';
import { DecksService } from './decks.service';

@Module({
  controllers: [DecksController],
  providers: [DecksService, DecksRepository],
  exports: [DecksService, DecksRepository],
})
export class DecksModule {}
