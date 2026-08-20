import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: '+55 43 99999-9999' })
  @IsString()
  @MinLength(8)
  @MaxLength(24)
  @Matches(/^[+\d\s()-]+$/, {
    message: 'Informe um WhatsApp válido com DDI (ex.: +55 43 99999-9999).',
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

  @ApiProperty({ example: 'BR' })
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  @Matches(/^[A-Za-z]{2}$/, {
    message: 'Informe o país com o código de 2 letras (ex.: BR).',
  })
  country!: string;

  @ApiProperty({ example: 'PR' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  state!: string;

  @ApiProperty({ example: 'Arapongas' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @ApiProperty({ example: 'Squad 1' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  squad!: string;

  @ApiProperty({ example: 'Fire 2026' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  eventoFire!: string;

  @ApiProperty({ example: 'ana@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ description: 'Data URL ou base64 JPEG/PNG/WebP' })
  @IsOptional()
  @IsString()
  photoBase64?: string;
}
