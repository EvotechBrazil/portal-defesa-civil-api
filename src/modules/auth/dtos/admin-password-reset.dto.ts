import { ApiProperty } from '@nestjs/swagger';

export class AdminPasswordResetDto {
  @ApiProperty({
    description:
      'Link de redefinição em claro. Só esta rota o devolve; o admin repassa pelo WhatsApp.',
  })
  resetUrl!: string;
}
