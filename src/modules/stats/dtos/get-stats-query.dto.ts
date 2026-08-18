import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GetStatsQueryDto {
  @ApiPropertyOptional({ description: 'Filtra agregações pelo curso' })
  @IsOptional()
  @IsString()
  courseId?: string;
}
