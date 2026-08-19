import { ApiPropertyOptional } from '@nestjs/swagger';
import { AccessRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/dtos/pagination.dto';

export class ListAccessRequestsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: AccessRequestStatus })
  @IsOptional()
  @IsEnum(AccessRequestStatus)
  status?: AccessRequestStatus;
}
