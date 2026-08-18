import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DecksService } from './decks.service';

@ApiTags('decks')
@Controller('decks')
export class DecksController {
  constructor(private readonly decksService: DecksService) {}

  @Get()
  list() {
    return this.decksService.list();
  }
}
