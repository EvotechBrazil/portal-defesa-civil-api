import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AllowWhatsappDto {
  @ApiProperty({ example: '(43) 99999-9999' })
  @IsString()
  @MinLength(10)
  @MaxLength(20)
  @Matches(/^[+\d\s()-]+$/, {
    message: 'Informe um WhatsApp válido com DDD.',
  })
  whatsapp!: string;

  @ApiPropertyOptional({ example: 'Ana Silva' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}
