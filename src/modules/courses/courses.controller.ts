import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CoursesService } from './courses.service';

@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  list() {
    return this.coursesService.list();
  }

  @Get(":slug")
  getBySlug() {
    return this.coursesService.getBySlug();
  }

  @Get(":slug/pages/:pageSlug")
  getPage() {
    return this.coursesService.getPage();
  }

  @Post(":slug/enroll")
  enroll() {
    return this.coursesService.enroll();
  }
}
