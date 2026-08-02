import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('handles undefined and null values', () => {
    expect(cn('a', undefined, null, 'b')).toBe('a b');
  });

  it('handles empty string in clsx', () => {
    expect(cn('', 'a')).toBe('a');
  });

  it('handles no arguments', () => {
    expect(cn()).toBe('');
  });

  it('merges Tailwind classes (later wins)', () => {
    expect(cn('px-4', 'px-2')).toBe('px-2');
  });

  it('merges conflicting classes', () => {
    expect(cn('text-red-500', 'text-blue-700')).toBe('text-blue-700');
  });

  it('handles object syntax', () => {
    expect(cn({ foo: true, bar: false })).toBe('foo');
  });

  it('handles array syntax', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });
});