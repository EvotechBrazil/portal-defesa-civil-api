import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { appConfig, databaseConfig, jwtConfig, mailConfig } from './config';
import { PrismaModule } from './database/prisma.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AccessModule } from './modules/access/access.module';
import { AuthModule } from './modules/auth/auth.module';
import { ManadasModule } from './modules/manadas/manadas.module';
import { UsersModule } from './modules/users/users.module';
import { CoursesModule } from './modules/courses/courses.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { DecksModule } from './modules/decks/decks.module';
import { StudyModule } from './modules/study/study.module';
import { PracticeModule } from './modules/practice/practice.module';
import { StatsModule } from './modules/stats/stats.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, mailConfig],
    }),
    PrismaModule,
    AuthModule,
    AccessModule,
    ManadasModule,
    UsersModule,
    CoursesModule,
    QuestionsModule,
    DecksModule,
    StudyModule,
    PracticeModule,
    StatsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
