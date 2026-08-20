import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateManadaDto {
  @ApiProperty({ example: 'Manada Norte' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

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
}
