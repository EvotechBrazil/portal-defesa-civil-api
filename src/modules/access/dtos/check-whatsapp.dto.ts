import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CheckWhatsappDto {
  @ApiProperty({ example: '5543999999999' })
  @IsString()
  @MinLength(8)
  @MaxLength(15)
  @Matches(/^\d{8,15}$/, {
    message: 'Informe só números, com DDI (ex.: 5543999999999).',
  })
  whatsapp!: string;
}
