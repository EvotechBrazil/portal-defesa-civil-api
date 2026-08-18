import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeckSelector } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export enum StudyFilterDto {
  ALL = 'ALL',
  HARD_ONLY = 'HARD_ONLY',
}

export class CreateStudySessionDto {
  @ApiProperty({ enum: DeckSelector })
  @IsEnum(DeckSelector)
  deckSelector!: DeckSelector;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  bidir?: boolean;

  @ApiPropertyOptional({ enum: StudyFilterDto, default: StudyFilterDto.ALL })
  @IsOptional()
  @IsEnum(StudyFilterDto)
  filter?: StudyFilterDto;
}
