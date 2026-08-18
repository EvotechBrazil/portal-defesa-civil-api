import {
  createFisherYates,
  fisherYatesShuffle,
  mulberry32,
} from './practice.shuffle';

describe('practice shuffle', () => {
  const items = [0, 1, 2, 3, 4, 5, 6, 7];

  it('is deterministic for the same seed', () => {
    const first = fisherYatesShuffle(items, mulberry32(42));
    const second = fisherYatesShuffle(items, mulberry32(42));
    expect(first).toEqual(second);
  });

  it('produces different permutations for different seeds', () => {
    const first = createFisherYates(mulberry32(1))(items);
    const second = createFisherYates(mulberry32(2))(items);
    expect(first).not.toEqual(second);
    expect(first.slice().sort((a, b) => a - b)).toEqual(items);
    expect(second.slice().sort((a, b) => a - b)).toEqual(items);
  });

  it('does not mutate the original array', () => {
    const source = [...items];
    fisherYatesShuffle(source, mulberry32(9));
    expect(source).toEqual(items);
  });
});
