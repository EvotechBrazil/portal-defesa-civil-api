import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CreateManadaDto } from './dtos/create-manada.dto';
import { ListManadasDto } from './dtos/list-manadas.dto';
import { ManadasService } from './manadas.service';

@ApiTags('manadas')
@Controller('manadas')
export class ManadasController {
  constructor(private readonly manadasService: ManadasService) {}

  @Public()
  @Get()
  list(@Query() query: ListManadasDto) {
    return this.manadasService.listPublic(query);
  }

  @Public()
  @Post()
  create(@Body() body: CreateManadaDto) {
    return this.manadasService.createPublic(body);
  }
}
