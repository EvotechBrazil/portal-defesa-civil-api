import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AllowWhatsappDto {
  @ApiProperty({ example: '5543999999999' })
  @IsString()
  @MinLength(8)
  @MaxLength(15)
  @Matches(/^\d{8,15}$/, {
    message: 'Informe só números, com DDI (ex.: 5543999999999).',
  })
  whatsapp!: string;

  @ApiPropertyOptional({ example: 'Ana Silva' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}
