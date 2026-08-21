import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinRole } from '../../common/decorators/min-role.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { AuthService } from './auth.service';
import { AdminPasswordResetDto } from './dtos/admin-password-reset.dto';

@ApiTags('admin-users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
@ApiForbiddenResponse({ description: 'Papel insuficiente.' })
@MinRole(UserRole.ADMIN_SENIOR)
@Controller('admin')
export class AuthAdminController {
  constructor(private readonly authService: AuthService) {}

  @Post('users/:userId/password-reset')
  @HttpCode(200)
  @Throttle({ admin: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Gera link de redefinicao de senha sem enviar e-mail.',
    description:
      'Exige ADMIN_SENIOR. O ator precisa estar estritamente acima do alvo. ' +
      'Devolve o link em claro para repassar pelo WhatsApp. ' +
      'Alvo de outro tenant, inexistente ou soft-deletado responde 404, nunca 403.',
  })
  @ApiOkResponse({ type: AdminPasswordResetDto })
  @ApiNotFoundResponse({ description: 'Usuario nao encontrado neste tenant.' })
  issuePasswordReset(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.authService.issueAdminPasswordReset(user, tenantId, userId);
  }
}
