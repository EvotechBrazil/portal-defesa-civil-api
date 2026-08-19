import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CheckWhatsappDto {
  @ApiProperty({ example: '(43) 99999-9999' })
  @IsString()
  @MinLength(10)
  @MaxLength(20)
  @Matches(/^[+\d\s()-]+$/, {
    message: 'Informe um WhatsApp válido com DDD.',
  })
  whatsapp!: string;
}
