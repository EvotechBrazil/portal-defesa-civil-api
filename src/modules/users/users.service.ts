import { Injectable, NotImplementedException } from '@nestjs/common';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  getMe(): never {
    throw new NotImplementedException('UsersService.getMe');
  }
}
