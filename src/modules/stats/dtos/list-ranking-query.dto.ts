import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dtos/pagination.dto';

export const RANKING_SORT = ['priority', 'accuracy', 'activeDays'] as const;
export type RankingSortBy = (typeof RANKING_SORT)[number];

export class ListRankingQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      'Obrigatório se moduleCode não for enviado. Sem recorte a API responde 400.',
  })
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiPropertyOptional({
    example: 'M2',
    description:
      'Obrigatório se courseId não for enviado. Sem recorte a API responde 400.',
  })
  @IsOptional()
  @IsString()
  moduleCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manadaId?: string;

  @ApiPropertyOptional({ example: 'PR' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'Arapongas' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    default: 3,
    minimum: 3,
    maximum: 100,
    description:
      'Piso anti-ruído: abaixo disso a pessoa sai da ordenação e vai para insufficientBase. Mínimo 3 — com 0, quem nunca tentou entra no bloco com base.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(100)
  minAttempts = 3;

  @ApiPropertyOptional({ enum: RANKING_SORT, default: 'priority' })
  @IsOptional()
  @IsIn(RANKING_SORT)
  sortBy?: RankingSortBy = 'priority';
}
