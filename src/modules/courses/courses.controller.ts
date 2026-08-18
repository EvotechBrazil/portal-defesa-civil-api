import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dtos/pagination.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { CoursesService } from './courses.service';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  list(
    @Query() query: PaginationDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
  ) {
    return this.coursesService.list(query, user.id, tenantId);
  }

  @Get(':slug/pages/:pageSlug')
  getPage(@Param('slug') slug: string, @Param('pageSlug') pageSlug: string) {
    return this.coursesService.getPage(slug, pageSlug);
  }

  @Get(':slug')
  getBySlug(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
  ) {
    return this.coursesService.getBySlug(slug, user.id, tenantId);
  }

  @Post(':slug/enroll')
  enroll(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
  ) {
    return this.coursesService.enroll(slug, user.id, tenantId);
  }
}
