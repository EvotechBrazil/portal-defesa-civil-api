import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CheckWhatsappDto {
  @ApiProperty({ example: '+55 43 99999-9999' })
  @IsString()
  @MinLength(8)
  @MaxLength(24)
  @Matches(/^[+\d\s()-]+$/, {
    message: 'Informe um WhatsApp válido com DDI (ex.: +55 43 99999-9999).',
  })
  whatsapp!: string;
}
