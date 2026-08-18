import { ApiProperty } from '@nestjs/swagger';

export class ModuleAccuracyDto {
  @ApiProperty({ example: 'M1' })
  code!: string;

  @ApiProperty({ example: 'Apresentação LGND 01' })
  title!: string;

  @ApiProperty({ example: 75 })
  accuracyPct!: number;

  @ApiProperty({ example: 4 })
  attempts!: number;
}

export class CardLevelsDto {
  @ApiProperty({ example: 10 })
  NEW!: number;

  @ApiProperty({ example: 3 })
  HARD!: number;

  @ApiProperty({ example: 8 })
  LEARNING!: number;

  @ApiProperty({ example: 12 })
  EASY!: number;
}

export class StuckCardDto {
  @ApiProperty()
  cardId!: string;

  @ApiProperty({ example: '#1' })
  code!: string;

  @ApiProperty()
  frontMd!: string;

  @ApiProperty({ example: 5 })
  seen!: number;

  @ApiProperty({ example: 0 })
  streak!: number;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastSeenAt!: string | null;
}

export class ReviewTallyDto {
  @ApiProperty({ example: 2 })
  HARD!: number;

  @ApiProperty({ example: 3 })
  LEARNING!: number;

  @ApiProperty({ example: 5 })
  EASY!: number;
}

export class SessionLast30dDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  endedAt!: string | null;

  @ApiProperty({ example: 10 })
  reviews!: number;

  @ApiProperty({ type: ReviewTallyDto })
  tally!: ReviewTallyDto;

  @ApiProperty({ enum: ['ESSENTIAL', 'FULL'] })
  deckSelector!: 'ESSENTIAL' | 'FULL';
}

export class StatsResponseDto {
  @ApiProperty({ type: [ModuleAccuracyDto] })
  byModule!: ModuleAccuracyDto[];

  @ApiProperty({ type: CardLevelsDto })
  cardLevels!: CardLevelsDto;

  @ApiProperty({ type: [StuckCardDto] })
  stuckCards!: StuckCardDto[];

  @ApiProperty({ type: [SessionLast30dDto] })
  sessionsLast30d!: SessionLast30dDto[];
}
