export type PracticeShuffle = <T>(items: readonly T[]) => T[];

export type RandomFn = () => number;

export function mulberry32(seed: number): RandomFn {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fisherYatesShuffle<T>(
  items: readonly T[],
  random: RandomFn,
): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const current = copy[i];
    const swap = copy[j];
    if (current === undefined || swap === undefined) {
      continue;
    }
    copy[i] = swap;
    copy[j] = current;
  }
  return copy;
}

export function createFisherYates(random: RandomFn): PracticeShuffle {
  return <T>(items: readonly T[]): T[] => fisherYatesShuffle(items, random);
}

export const defaultPracticeShuffle: PracticeShuffle = createFisherYates(
  Math.random,
);
