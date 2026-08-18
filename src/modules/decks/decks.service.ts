import { Injectable, NotImplementedException } from '@nestjs/common';
import { DecksRepository } from './decks.repository';

@Injectable()
export class DecksService {
  constructor(private readonly decksRepository: DecksRepository) {}

  list(): never {
    throw new NotImplementedException('DecksService.list');
  }
}
