import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
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
import { AdminUserDto } from './dtos/admin-user.dto';
import { ChangeUserRoleDto } from './dtos/change-user-role.dto';
import { ListRoleChangesDto } from './dtos/list-role-changes.dto';
import { ListUsersDto } from './dtos/list-users.dto';
import { RoleChangeDto } from './dtos/role-change.dto';
import { UsersService } from './users.service';

@ApiTags('admin-users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
@ApiForbiddenResponse({ description: 'Papel insuficiente.' })
// Regua da classe em ADMIN: um ADMIN LE a lista de usuarios. As rotas que
// concedem papel e leem a auditoria sobem a regua para ADMIN_SENIOR.
@MinRole(UserRole.ADMIN)
@Controller('admin')
export class UsersAdminController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  @ApiOperation({ summary: 'Lista usuarios do tenant, paginado.' })
  @ApiOkResponse({ type: AdminUserDto, isArray: true })
  listUsers(@CurrentTenant() tenantId: string, @Query() query: ListUsersDto) {
    return this.usersService.listUsers(tenantId, query);
  }

  @Patch('users/:id/role')
  @MinRole(UserRole.ADMIN_SENIOR)
  @Throttle({ admin: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Concede ou revoga papel.',
    description:
      'Exige ADMIN_SENIOR. O ator precisa estar estritamente acima do papel ' +
      'atual do alvo e do papel de destino. SUPER_ADMIN nunca e atribuivel. ' +
      'Alvo de outro tenant responde 404, nunca 403.',
  })
  @ApiOkResponse({ type: AdminUserDto })
  @ApiNotFoundResponse({ description: 'Usuario nao encontrado neste tenant.' })
  changeRole(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ChangeUserRoleDto,
  ) {
    return this.usersService.changeUserRole(user, tenantId, id, body.role);
  }

  @Get('role-changes')
  @MinRole(UserRole.ADMIN_SENIOR)
  @ApiOperation({ summary: 'Trilha de auditoria de mudanca de papel.' })
  @ApiOkResponse({ type: RoleChangeDto, isArray: true })
  listRoleChanges(
    @CurrentTenant() tenantId: string,
    @Query() query: ListRoleChangesDto,
  ) {
    return this.usersService.listRoleChanges(tenantId, query);
  }
}
