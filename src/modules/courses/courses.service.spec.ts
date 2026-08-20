import { NotFoundException } from '@nestjs/common';
import { Course, Enrollment } from '@prisma/client';
import { CoursesService } from './courses.service';
import { CourseDetailRecord, CoursesRepository } from './courses.repository';

function courseFixture(overrides?: Partial<Course>): Course {
  return {
    id: 'course-1',
    slug: 'defesa-civil-lgnd',
    title: 'Programa de evolução contínua LGND SQUAD',
    description: 'Curso de formação',
    sourcePlatform: 'ticketandgo',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

function detailFixture(): CourseDetailRecord {
  return {
    ...courseFixture(),
    modules: [
      {
        id: 'mod-1',
        courseId: 'course-1',
        ord: 1,
        code: 'M1',
        title: 'Apresentação',
        summaryMd: 'Resumo M1',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        deletedAt: null,
        quizzes: [
          { id: 'quiz-1', _count: { questions: 8 } },
          { id: 'quiz-2', _count: { questions: 5 } },
        ],
      },
    ],
    contentPages: [
      { slug: 'pareto', title: 'Núcleo Pareto 80/20', ord: 1 },
      { slug: 'modulos', title: 'Resumo por módulo', ord: 2 },
    ],
  };
}

function enrollmentFixture(overrides?: Partial<Enrollment>): Enrollment {
  return {
    id: 'enroll-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    courseId: 'course-1',
    startedAt: new Date('2026-01-02'),
    completedAt: null,
    createdAt: new Date('2026-01-02'),
    updatedAt: new Date('2026-01-02'),
    deletedAt: null,
    ...overrides,
  };
}

describe('CoursesService', () => {
  let service: CoursesService;
  let repository: jest.Mocked<
    Pick<
      CoursesRepository,
      | 'findMany'
      | 'count'
      | 'findEnrollments'
      | 'findBySlug'
      | 'findPage'
      | 'upsertEnrollment'
    >
  >;

  beforeEach(() => {
    repository = {
      findMany: jest.fn(),
      count: jest.fn(),
      findEnrollments: jest.fn(),
      findBySlug: jest.fn(),
      findPage: jest.fn(),
      upsertEnrollment: jest.fn(),
    };
    service = new CoursesService(repository as unknown as CoursesRepository);
  });

  describe('list', () => {
    it('returns catalog with isEnrolled for the current user only', async () => {
      const enrolled = courseFixture();
      const other = courseFixture({
        id: 'course-2',
        slug: 'outro',
        title: 'Outro',
      });
      repository.findMany.mockResolvedValue([enrolled, other]);
      repository.count.mockResolvedValue(2);
      repository.findEnrollments.mockResolvedValue([{ courseId: enrolled.id }]);

      const result = await service.list(
        { page: 1, pageSize: 20 },
        'user-1',
        'tenant-1',
      );

      expect(repository.findEnrollments).toHaveBeenCalledWith(
        'user-1',
        'tenant-1',
        [enrolled.id, other.id],
      );
      expect(result.data).toEqual([
        expect.objectContaining({
          slug: 'defesa-civil-lgnd',
          isEnrolled: true,
        }),
        expect.objectContaining({ slug: 'outro', isEnrolled: false }),
      ]);
      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 2,
        pageCount: 1,
      });
    });

    it('clamps pageSize at 100', async () => {
      repository.findMany.mockResolvedValue([]);
      repository.count.mockResolvedValue(0);
      repository.findEnrollments.mockResolvedValue([]);

      await service.list({ page: 1, pageSize: 500 }, 'user-1', 'tenant-1');

      expect(repository.findMany).toHaveBeenCalledWith(0, 100);
    });
  });

  describe('getBySlug', () => {
    it('returns modules with quiz and question counts plus page index', async () => {
      repository.findBySlug.mockResolvedValue(detailFixture());
      repository.findEnrollments.mockResolvedValue([]);

      const result = await service.getBySlug(
        'defesa-civil-lgnd',
        'user-1',
        'tenant-1',
      );

      expect(result.modules).toEqual([
        expect.objectContaining({
          code: 'M1',
          quizCount: 2,
          questionCount: 13,
        }),
      ]);
      expect(result.pages).toHaveLength(2);
      expect(result.isEnrolled).toBe(false);
    });

    it('throws when the course does not exist', async () => {
      repository.findBySlug.mockResolvedValue(null);

      await expect(
        service.getBySlug('missing', 'user-1', 'tenant-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getPage', () => {
    it('returns slug, title and bodyMd', async () => {
      repository.findPage.mockResolvedValue({
        slug: 'pareto',
        title: 'Núcleo Pareto 80/20',
        bodyMd: '# RISCO',
      });

      await expect(
        service.getPage('defesa-civil-lgnd', 'pareto'),
      ).resolves.toEqual({
        slug: 'pareto',
        title: 'Núcleo Pareto 80/20',
        bodyMd: '# RISCO',
      });
    });

    it('throws when the page does not exist', async () => {
      repository.findPage.mockResolvedValue(null);

      await expect(
        service.getPage('defesa-civil-lgnd', 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('enroll', () => {
    it('upserts enrollment for the authenticated tenant user', async () => {
      repository.findBySlug.mockResolvedValue(detailFixture());
      repository.upsertEnrollment.mockResolvedValue(enrollmentFixture());

      const result = await service.enroll(
        'defesa-civil-lgnd',
        'user-1',
        'tenant-1',
      );

      expect(repository.upsertEnrollment).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        userId: 'user-1',
        courseId: 'course-1',
      });
      expect(result.id).toBe('enroll-1');
      expect(result.userId).toBe('user-1');
      expect(result.tenantId).toBe('tenant-1');
      expect(result.courseId).toBe('course-1');
      expect(result.startedAt).toEqual(enrollmentFixture().startedAt);
      expect(result.completedAt).toBeNull();
    });

    it('is idempotent — a second call returns the same enrollment', async () => {
      const enrollment = enrollmentFixture();
      repository.findBySlug.mockResolvedValue(detailFixture());
      repository.upsertEnrollment.mockResolvedValue(enrollment);

      const first = await service.enroll(
        'defesa-civil-lgnd',
        'user-1',
        'tenant-1',
      );
      const second = await service.enroll(
        'defesa-civil-lgnd',
        'user-1',
        'tenant-1',
      );

      expect(first.id).toBe(second.id);
      expect(repository.upsertEnrollment).toHaveBeenCalledTimes(2);
    });

    it('throws when the course does not exist', async () => {
      repository.findBySlug.mockResolvedValue(null);

      await expect(
        service.enroll('missing', 'user-1', 'tenant-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.upsertEnrollment).not.toHaveBeenCalled();
    });
  });
});
