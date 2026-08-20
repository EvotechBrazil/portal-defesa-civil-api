import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RequestAccessDto {
  @ApiProperty({ example: '5543999999999' })
  @IsString()
  @MinLength(8)
  @MaxLength(15)
  @Matches(/^\d{8,15}$/, {
    message: 'Informe só números, com DDI (ex.: 5543999999999).',
  })
  whatsapp!: string;

  @ApiProperty({ example: 'Ana Silva' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '1001' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  lgndNumber!: string;

  @ApiPropertyOptional({ example: 'clxyzmanada01' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  manadaId?: string;

  @ApiPropertyOptional({ example: 'Manada Norte' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  manada?: string;

  @ApiPropertyOptional({ example: 'BR' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  @Matches(/^[A-Za-z]{2}$/, {
    message: 'Informe o país com o código de 2 letras (ex.: BR).',
  })
  country?: string;

  @ApiPropertyOptional({ example: 'PR' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  state?: string;

  @ApiPropertyOptional({ example: 'Arapongas' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city?: string;

  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Sou da manada e quero estudar para a prova.' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  justification!: string;
}
