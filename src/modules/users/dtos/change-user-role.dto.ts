import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ChangeUserRoleDto {
  /**
   * Valida contra o enum INTEIRO de proposito. Restringir aqui aos papeis
   * atribuiveis faria o ValidationPipe responder 400 para SUPER_ADMIN, antes
   * de chegar no service — e o contrato pede 403.
   */
  @ApiProperty({
    enum: UserRole,
    description:
      'SUPER_ADMIN e recusado com 403: so o seed atribui o topo da piramide.',
  })
  @IsEnum(UserRole)
  role!: UserRole;
}
