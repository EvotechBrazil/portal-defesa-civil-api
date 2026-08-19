import { ApiPropertyOptional } from '@nestjs/swagger';
import { CardLevel } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

/**
 * Foco da sessão: apresenta apenas as cartas da fila que estão nesse nível.
 * Ausente = fila inteira (KPI "na fila").
 */
export class StudyFocusQueryDto {
  @ApiPropertyOptional({ enum: CardLevel })
  @IsOptional()
  @IsEnum(CardLevel)
  focus?: CardLevel;
}
