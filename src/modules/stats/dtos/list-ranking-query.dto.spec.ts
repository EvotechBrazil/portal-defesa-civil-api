import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListRankingQueryDto } from './list-ranking-query.dto';

describe('ListRankingQueryDto', () => {
  it('rejects minAttempts below 3 so zero-attempt users cannot enter the ranked block', async () => {
    const dto = plainToInstance(ListRankingQueryDto, {
      minAttempts: 0,
      courseId: 'course-1',
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'minAttempts')).toBe(true);
  });

  it('accepts the default floor of 3', async () => {
    const dto = plainToInstance(ListRankingQueryDto, { courseId: 'course-1' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'minAttempts')).toBe(
      false,
    );
  });

  it('rejects coverage as sortBy', async () => {
    const dto = plainToInstance(ListRankingQueryDto, {
      courseId: 'course-1',
      sortBy: 'coverage',
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'sortBy')).toBe(true);
  });
});
