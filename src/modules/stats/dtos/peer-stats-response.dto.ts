import { ApiProperty } from '@nestjs/swagger';
import { STUDY_PRIORITY_DISCLAIMER } from '../priority-score';
import { StatsResponseDto } from './stats-response.dto';

export class PeerManadaDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  state!: string;
}

export class PeerProfileDto {
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

  @ApiProperty({ nullable: true, type: PeerManadaDto })
  manada!: PeerManadaDto | null;
}

export class PeerStatsResponseDto extends StatsResponseDto {
  @ApiProperty({ type: PeerProfileDto })
  profile!: PeerProfileDto;

  @ApiProperty({ example: STUDY_PRIORITY_DISCLAIMER })
  disclaimer!: string;
}
