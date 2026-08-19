import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RequestAccessDto {
  @ApiProperty({ example: '(43) 99999-9999' })
  @IsString()
  @MinLength(10)
  @MaxLength(20)
  @Matches(/^[+\d\s()-]+$/, {
    message: 'Informe um WhatsApp válido com DDD.',
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

  @ApiProperty({ example: 'Manada Norte' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  manada!: string;

  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Sou da manada e quero estudar para a prova.' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  justification!: string;
}
