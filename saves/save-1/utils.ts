import { random } from 'farmer';

export function floorPercent(value: number, percent: number): number {
  return Math.floor(value * percent);
}

export function randomBetween(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

export function randomItem<T>(list: T[]): T {
  return list[randomBetween(0, list.length - 1)];
}

/**
 * Modulo that always returns a non-negative result, matching Python's `%` for a positive `divisor`.
 */
export function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
