import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AllowWhatsappDto {
  @ApiProperty({ example: '+55 43 99999-9999' })
  @IsString()
  @MinLength(8)
  @MaxLength(24)
  @Matches(/^[+\d\s()-]+$/, {
    message: 'Informe um WhatsApp válido com DDI (ex.: +55 43 99999-9999).',
  })
  whatsapp!: string;

  @ApiPropertyOptional({ example: 'Ana Silva' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}
