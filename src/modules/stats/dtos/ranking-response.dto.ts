import { ApiProperty } from '@nestjs/swagger';
import {
  PRACTICAL_TRAINING_NOTICE,
  STUDY_PRIORITY_DISCLAIMER,
} from '../priority-score';

export class RankingManadaDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  state!: string;
}

export class RankingStudyDto {
  @ApiProperty({ example: 75 })
  practiceAccuracyPct!: number;

  @ApiProperty({ example: 12 })
  attempts!: number;

  @ApiProperty({ example: 8 })
  activeDays30d!: number;

  @ApiProperty({
    example: 40,
    description: 'Autodeclarado (CardState.level). Não entra no priorityScore.',
  })
  coveragePct!: number;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastActiveAt!: string | null;

  @ApiProperty({ type: [String], example: ['coveragePct'] })
  selfReported!: string[];
}

export class RankingPriorityPartsDto {
  @ApiProperty({ example: 37.5 })
  accuracy!: number;

  @ApiProperty({ example: 12 })
  consistency!: number;

  @ApiProperty({ example: 8 })
  volume!: number;
}

export class RankingItemDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  photoUrl!: string | null;

  @ApiProperty({ nullable: true, type: String })
  lgndNumber!: string | null;

  @ApiProperty({ nullable: true, type: RankingManadaDto })
  manada!: RankingManadaDto | null;

  @ApiProperty({ type: RankingStudyDto })
  study!: RankingStudyDto;

  @ApiProperty({ example: 58 })
  priorityScore!: number;

  @ApiProperty({ enum: ['high', 'mid', 'low'] })
  engagementBand!: 'high' | 'mid' | 'low';

  @ApiProperty({ type: RankingPriorityPartsDto })
  priorityParts!: RankingPriorityPartsDto;

  @ApiProperty({
    nullable: true,
    type: Object,
    description:
      'Ponto de extensão. Formação credenciada e disponibilidade entram aqui depois.',
  })
  operational!: null;

  @ApiProperty({
    example: PRACTICAL_TRAINING_NOTICE,
    description:
      'Obrigatório na linha enquanto operational === null. Um recorte da lista precisa carregar o aviso.',
  })
  practicalTrainingNotice!: string;
}

export class RankingDataDto {
  @ApiProperty({ type: [RankingItemDto] })
  ranked!: RankingItemDto[];

  @ApiProperty({ type: [RankingItemDto] })
  insufficientBase!: RankingItemDto[];
}

export class RankingMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 40 })
  total!: number;

  @ApiProperty({ example: 2 })
  pageCount!: number;

  @ApiProperty({ example: STUDY_PRIORITY_DISCLAIMER })
  disclaimer!: string;

  @ApiProperty({
    example: false,
    description:
      'true quando o recorte passou de 500 pessoas e a lista foi cortada',
  })
  truncated!: boolean;
}
