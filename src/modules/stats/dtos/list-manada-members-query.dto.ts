import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/dtos/pagination.dto';

export const MANADA_MEMBER_SORT = ['name', 'lastActiveAt'] as const;
export type ManadaMemberSortBy = (typeof MANADA_MEMBER_SORT)[number];

export class ListManadaMembersQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: MANADA_MEMBER_SORT, default: 'name' })
  @IsOptional()
  @IsIn(MANADA_MEMBER_SORT)
  sortBy?: ManadaMemberSortBy = 'name';
}
