-- AlterTable
ALTER TABLE "study_sessions" ADD COLUMN "course_id" TEXT;

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "study_sessions_course_id_idx" ON "study_sessions"("course_id");
