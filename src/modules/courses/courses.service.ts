import { Injectable, NotFoundException } from '@nestjs/common';
import { Course } from '@prisma/client';
import {
  PaginationDto,
  PaginationMeta,
  buildPaginationMeta,
} from '../../common/dtos/pagination.dto';
import {
  CourseDetailDto,
  CourseListItemDto,
  CoursePageDto,
  EnrollmentDto,
} from './dtos/course-response.dto';
import { CourseDetailRecord, CoursesRepository } from './courses.repository';

const MAX_PAGE_SIZE = 100;

@Injectable()
export class CoursesService {
  constructor(private readonly coursesRepository: CoursesRepository) {}

  async list(
    query: PaginationDto,
    userId: string,
    tenantId: string,
  ): Promise<{ data: CourseListItemDto[]; meta: PaginationMeta }> {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(query.pageSize ?? 20, MAX_PAGE_SIZE);
    const skip = (page - 1) * pageSize;

    const [courses, total] = await Promise.all([
      this.coursesRepository.findMany(skip, pageSize),
      this.coursesRepository.count(),
    ]);

    const enrollments = await this.coursesRepository.findEnrollments(
      userId,
      tenantId,
      courses.map((course) => course.id),
    );
    const enrolledIds = new Set(
      enrollments.map((enrollment) => enrollment.courseId),
    );

    return {
      data: courses.map((course) => this.toListItem(course, enrolledIds)),
      meta: buildPaginationMeta(page, pageSize, total),
    };
  }

  async getBySlug(
    slug: string,
    userId: string,
    tenantId: string,
  ): Promise<CourseDetailDto> {
    const course = await this.coursesRepository.findBySlug(slug);
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const enrollments = await this.coursesRepository.findEnrollments(
      userId,
      tenantId,
      [course.id],
    );

    return this.toDetail(course, enrollments.length > 0);
  }

  async getPage(slug: string, pageSlug: string): Promise<CoursePageDto> {
    const page = await this.coursesRepository.findPage(slug, pageSlug);
    if (!page) {
      throw new NotFoundException('Content page not found');
    }
    return {
      slug: page.slug,
      title: page.title,
      bodyMd: page.bodyMd,
    };
  }

  async enroll(
    slug: string,
    userId: string,
    tenantId: string,
  ): Promise<EnrollmentDto> {
    const course = await this.coursesRepository.findBySlug(slug);
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const enrollment = await this.coursesRepository.upsertEnrollment({
      tenantId,
      userId,
      courseId: course.id,
    });

    return {
      id: enrollment.id,
      userId: enrollment.userId,
      tenantId: enrollment.tenantId,
      courseId: enrollment.courseId,
      startedAt: enrollment.startedAt,
      completedAt: enrollment.completedAt,
    };
  }

  private toListItem(
    course: Course,
    enrolledIds: Set<string>,
  ): CourseListItemDto {
    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      sourcePlatform: course.sourcePlatform,
      isEnrolled: enrolledIds.has(course.id),
    };
  }

  private toDetail(
    course: CourseDetailRecord,
    isEnrolled: boolean,
  ): CourseDetailDto {
    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      sourcePlatform: course.sourcePlatform,
      isEnrolled,
      modules: course.modules.map((module) => ({
        id: module.id,
        code: module.code,
        title: module.title,
        ord: module.ord,
        summaryMd: module.summaryMd,
        quizCount: module.quizzes.length,
        questionCount: module.quizzes.reduce(
          (sum, quiz) => sum + quiz._count.questions,
          0,
        ),
      })),
      pages: course.contentPages.map((page) => ({
        slug: page.slug,
        title: page.title,
        ord: page.ord,
      })),
    };
  }
}
