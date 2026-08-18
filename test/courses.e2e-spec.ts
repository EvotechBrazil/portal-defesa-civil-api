import { INestApplication } from '@nestjs/common';
import { User } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import {
  CourseDetailDto,
  CourseListItemDto,
  CoursePageDto,
  EnrollmentDto,
} from '../src/modules/courses/dtos/course-response.dto';
import {
  createTestingApp,
  httpServer,
  readEnvelope,
} from './helpers/app.helper';
import { bearerFor, createSecondTenant } from './helpers/auth.helper';

const COURSE_SLUG = 'defesa-civil-lgnd';
const MODULE_QUESTION_COUNTS: Record<string, number> = {
  M1: 13,
  M2: 21,
  M3: 17,
  M4: 20,
  M5: 18,
  M6: 20,
  M7: 24,
};

describe('Courses (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    app = await createTestingApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.enrollment.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    if (createdTenantIds.length > 0) {
      await prisma.tenant.deleteMany({
        where: { id: { in: createdTenantIds } },
      });
    }
    await app.close();
  });

  async function authFor(overrides?: Partial<Pick<User, 'tenantId'>>) {
    const session = await bearerFor(prisma, overrides);
    createdUserIds.push(session.user.id);
    return session;
  }

  it('rejects unauthenticated catalog access', async () => {
    await request(httpServer(app)).get('/api/v1/courses').expect(401);
  });

  it('lists the global catalog with isEnrolled for the current user', async () => {
    const session = await authFor();

    const response = await request(httpServer(app))
      .get('/api/v1/courses')
      .set(session.header)
      .expect(200);

    const envelope = readEnvelope<CourseListItemDto[]>(response.body);
    expect(envelope.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: COURSE_SLUG,
          isEnrolled: false,
        }),
      ]),
    );
    expect(envelope.meta).toBeDefined();
    expect(envelope.meta?.page).toBe(1);
    expect(envelope.meta?.total).toBeGreaterThan(0);
    expect(envelope.meta?.pageSize).toBeLessThanOrEqual(100);
    expect(envelope.meta?.pageCount).toBeGreaterThan(0);
  });

  it('returns course, module counts and page index', async () => {
    const session = await authFor();

    const response = await request(httpServer(app))
      .get(`/api/v1/courses/${COURSE_SLUG}`)
      .set(session.header)
      .expect(200);

    const course = readEnvelope<CourseDetailDto>(response.body).data;
    expect(course.slug).toBe(COURSE_SLUG);
    expect(course.modules).toHaveLength(7);
    for (const [code, count] of Object.entries(MODULE_QUESTION_COUNTS)) {
      const module = course.modules.find((item) => item.code === code);
      expect(module).toBeDefined();
      expect(module?.questionCount).toBe(count);
      expect(module?.quizCount).toBeGreaterThan(0);
    }
    expect(course.pages.map((page) => page.slug).sort()).toEqual([
      'apostila',
      'apostila-01',
      'apostila-02',
      'apostila-03',
      'apostila-04',
      'apostila-05',
      'apostila-06',
      'apostila-07',
      'apostila-08',
      'gloss',
      'modulos',
      'pareto',
    ]);
  });

  it('returns a content page body', async () => {
    const session = await authFor();

    const response = await request(httpServer(app))
      .get(`/api/v1/courses/${COURSE_SLUG}/pages/pareto`)
      .set(session.header)
      .expect(200);

    const page = readEnvelope<CoursePageDto>(response.body).data;
    expect(page.slug).toBe('pareto');
    expect(page.title.length).toBeGreaterThan(0);
    expect(page.bodyMd).toContain('RISCO');
  });

  it('returns 404 for an unknown course or page', async () => {
    const session = await authFor();

    await request(httpServer(app))
      .get('/api/v1/courses/curso-inexistente')
      .set(session.header)
      .expect(404);

    await request(httpServer(app))
      .get(`/api/v1/courses/${COURSE_SLUG}/pages/inexistente`)
      .set(session.header)
      .expect(404);
  });

  it('enrolls idempotently', async () => {
    const session = await authFor();

    const first = await request(httpServer(app))
      .post(`/api/v1/courses/${COURSE_SLUG}/enroll`)
      .set(session.header)
      .expect(201);

    const second = await request(httpServer(app))
      .post(`/api/v1/courses/${COURSE_SLUG}/enroll`)
      .set(session.header)
      .expect(201);

    const firstEnrollment = readEnvelope<EnrollmentDto>(first.body).data;
    const secondEnrollment = readEnvelope<EnrollmentDto>(second.body).data;
    expect(firstEnrollment.id).toBe(secondEnrollment.id);
    expect(firstEnrollment.userId).toBe(session.user.id);
    expect(firstEnrollment.tenantId).toBe(session.user.tenantId);

    const catalog = await request(httpServer(app))
      .get('/api/v1/courses')
      .set(session.header)
      .expect(200);

    const course = readEnvelope<CourseListItemDto[]>(catalog.body).data.find(
      (item) => item.slug === COURSE_SLUG,
    );
    expect(course?.isEnrolled).toBe(true);
  });

  it('does not leak enrollments across tenants', async () => {
    const tenantB = await createSecondTenant(prisma);
    createdTenantIds.push(tenantB.id);

    const userA = await authFor();
    const userB = await authFor({ tenantId: tenantB.id });

    const enrollAResponse = await request(httpServer(app))
      .post(`/api/v1/courses/${COURSE_SLUG}/enroll`)
      .set(userA.header)
      .expect(201);
    const enrollA = readEnvelope<EnrollmentDto>(enrollAResponse.body).data;

    const listBResponse = await request(httpServer(app))
      .get('/api/v1/courses')
      .set(userB.header)
      .expect(200);
    const listB = readEnvelope<CourseListItemDto[]>(listBResponse.body);
    const courseB = listB.data.find((item) => item.slug === COURSE_SLUG);

    expect(courseB).toBeDefined();
    expect(courseB?.isEnrolled).toBe(false);
    expect(JSON.stringify(listB)).not.toContain(userA.user.id);
    expect(JSON.stringify(listB)).not.toContain(enrollA.id);

    const detailBResponse = await request(httpServer(app))
      .get(`/api/v1/courses/${COURSE_SLUG}`)
      .set(userB.header)
      .expect(200);
    expect(
      readEnvelope<CourseDetailDto>(detailBResponse.body).data.isEnrolled,
    ).toBe(false);

    const enrollBResponse = await request(httpServer(app))
      .post(`/api/v1/courses/${COURSE_SLUG}/enroll`)
      .set(userB.header)
      .expect(201);
    const enrollB = readEnvelope<EnrollmentDto>(enrollBResponse.body).data;

    expect(enrollB.id).not.toBe(enrollA.id);
    expect(enrollB.userId).toBe(userB.user.id);
    expect(enrollB.tenantId).toBe(tenantB.id);

    const enrollmentsA = await prisma.enrollment.findMany({
      where: { userId: userA.user.id, deletedAt: null },
    });
    const enrollmentsB = await prisma.enrollment.findMany({
      where: { userId: userB.user.id, deletedAt: null },
    });
    expect(enrollmentsA).toHaveLength(1);
    expect(enrollmentsB).toHaveLength(1);
    expect(enrollmentsA[0].tenantId).toBe(userA.user.tenantId);
    expect(enrollmentsB[0].tenantId).toBe(tenantB.id);
    expect(enrollmentsA[0].id).not.toBe(enrollmentsB[0].id);

    const listAResponse = await request(httpServer(app))
      .get('/api/v1/courses')
      .set(userA.header)
      .expect(200);
    const courseA = readEnvelope<CourseListItemDto[]>(
      listAResponse.body,
    ).data.find((item) => item.slug === COURSE_SLUG);
    expect(courseA?.isEnrolled).toBe(true);
  });
});
