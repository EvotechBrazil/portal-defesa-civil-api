import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { AccessService } from './access.service';
import { AllowWhatsappDto } from './dtos/allow-whatsapp.dto';
import { ListAccessRequestsDto } from './dtos/list-access-requests.dto';

@ApiTags('admin-access')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AccessAdminController {
  constructor(private readonly accessService: AccessService) {}

  @Get('access-requests')
  listRequests(
    @CurrentTenant() tenantId: string,
    @Query() query: ListAccessRequestsDto,
  ) {
    return this.accessService.listRequests(tenantId, query);
  }

  @Post('access-requests/:id/approve')
  @HttpCode(200)
  approve(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.accessService.approveRequest(tenantId, id, user.id);
  }

  @Post('access-requests/:id/reject')
  @HttpCode(200)
  reject(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.accessService.rejectRequest(tenantId, id, user.id);
  }

  @Get('allowed-whatsapps')
  listAllowed(
    @CurrentTenant() tenantId: string,
    @Query() query: PaginationDto,
  ) {
    return this.accessService.listAllowed(tenantId, query);
  }

  @Post('allowed-whatsapps')
  addAllowed(
    @CurrentTenant() tenantId: string,
    @Body() body: AllowWhatsappDto,
  ) {
    return this.accessService.addAllowed(tenantId, body);
  }

  @Delete('allowed-whatsapps/:id')
  @HttpCode(204)
  removeAllowed(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.accessService.removeAllowed(tenantId, id);
  }
}
