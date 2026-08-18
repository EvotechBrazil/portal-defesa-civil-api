export interface CourseListItemDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  sourcePlatform: string | null;
  isEnrolled: boolean;
}

export interface CourseModuleDto {
  id: string;
  code: string;
  title: string;
  ord: number;
  summaryMd: string | null;
  quizCount: number;
  questionCount: number;
}

export interface CoursePageIndexDto {
  slug: string;
  title: string;
  ord: number;
}

export interface CourseDetailDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  sourcePlatform: string | null;
  isEnrolled: boolean;
  modules: CourseModuleDto[];
  pages: CoursePageIndexDto[];
}

export interface CoursePageDto {
  slug: string;
  title: string;
  bodyMd: string;
}

export interface EnrollmentDto {
  id: string;
  userId: string;
  tenantId: string;
  courseId: string;
  startedAt: Date;
  completedAt: Date | null;
}
