import { Injectable } from '@nestjs/common';
import { Course, Enrollment, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const courseDetailInclude = {
  modules: {
    where: { deletedAt: null },
    orderBy: { ord: 'asc' as const },
    include: {
      quizzes: {
        where: { deletedAt: null },
        select: {
          id: true,
          _count: {
            select: {
              questions: { where: { deletedAt: null } },
            },
          },
        },
      },
    },
  },
  contentPages: {
    where: { deletedAt: null },
    orderBy: { ord: 'asc' as const },
    select: { slug: true, title: true, ord: true },
  },
} satisfies Prisma.CourseInclude;

export type CourseDetailRecord = Prisma.CourseGetPayload<{
  include: typeof courseDetailInclude;
}>;

export type CoursePageRecord = {
  slug: string;
  title: string;
  bodyMd: string;
};

@Injectable()
export class CoursesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(skip: number, take: number): Promise<Course[]> {
    return this.prisma.course.findMany({
      where: { deletedAt: null },
      orderBy: { title: 'asc' },
      skip,
      take,
    });
  }

  count(): Promise<number> {
    return this.prisma.course.count({ where: { deletedAt: null } });
  }

  findEnrollments(
    userId: string,
    tenantId: string,
    courseIds: string[],
  ): Promise<Pick<Enrollment, 'courseId'>[]> {
    if (courseIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.prisma.enrollment.findMany({
      where: {
        userId,
        tenantId,
        deletedAt: null,
        courseId: { in: courseIds },
      },
      select: { courseId: true },
    });
  }

  findBySlug(slug: string): Promise<CourseDetailRecord | null> {
    return this.prisma.course.findFirst({
      where: { slug, deletedAt: null },
      include: courseDetailInclude,
    });
  }

  findPage(
    courseSlug: string,
    pageSlug: string,
  ): Promise<CoursePageRecord | null> {
    return this.prisma.contentPage.findFirst({
      where: {
        slug: pageSlug,
        deletedAt: null,
        course: { slug: courseSlug, deletedAt: null },
      },
      select: { slug: true, title: true, bodyMd: true },
    });
  }

  upsertEnrollment(params: {
    tenantId: string;
    userId: string;
    courseId: string;
  }): Promise<Enrollment> {
    return this.prisma.enrollment.upsert({
      where: {
        userId_courseId: {
          userId: params.userId,
          courseId: params.courseId,
        },
      },
      create: {
        tenantId: params.tenantId,
        userId: params.userId,
        courseId: params.courseId,
      },
      update: { deletedAt: null },
    });
  }
}
