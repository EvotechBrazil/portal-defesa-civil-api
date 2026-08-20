import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ManadaMemberDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  photoUrl!: string | null;

  @ApiProperty({ nullable: true, type: String })
  lgndNumber!: string | null;

  @ApiProperty({ nullable: true, type: String })
  squad!: string | null;

  @ApiProperty({ example: 40 })
  coveragePct!: number;

  @ApiProperty({ example: 75 })
  practiceAccuracyPct!: number;

  @ApiProperty({ example: 8 })
  activeDays30d!: number;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastActiveAt!: string | null;
}

export class ManadaMembersMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  pageCount!: number;

  @ApiPropertyOptional({ enum: ['NO_MANADA'] })
  reason?: 'NO_MANADA';
}
