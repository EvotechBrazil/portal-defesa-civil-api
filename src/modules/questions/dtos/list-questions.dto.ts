import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dtos/pagination.dto';

export class ListQuestionsDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'M1' })
  @IsOptional()
  @IsString()
  moduleCode?: string;

  @ApiPropertyOptional({ example: '1.1' })
  @IsOptional()
  @IsString()
  quizCode?: string;

  @ApiPropertyOptional({ example: 'risco' })
  @IsOptional()
  @IsString()
  search?: string;
}
