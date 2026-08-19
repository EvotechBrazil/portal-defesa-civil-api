import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardLevel, ReviewRating } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ReviewStudySessionDto {
  @ApiProperty({ enum: ReviewRating })
  @IsEnum(ReviewRating)
  rating!: ReviewRating;

  @ApiPropertyOptional({
    enum: CardLevel,
    description: 'Foco ativo: avalia a primeira carta da fila nesse nível.',
  })
  @IsOptional()
  @IsEnum(CardLevel)
  focus?: CardLevel;
}
