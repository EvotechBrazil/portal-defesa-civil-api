import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dtos/pagination.dto';

export class ListRoleChangesDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filtra a trilha por usuario alvo.' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  targetUserId?: string;
}
