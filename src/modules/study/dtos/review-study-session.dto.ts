import { ApiProperty } from '@nestjs/swagger';
import { ReviewRating } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ReviewStudySessionDto {
  @ApiProperty({ enum: ReviewRating })
  @IsEnum(ReviewRating)
  rating!: ReviewRating;
}
