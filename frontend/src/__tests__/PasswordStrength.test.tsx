import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { passwordStrength, PasswordStrengthMeter } from '@/components/PasswordStrength';

describe('passwordStrength', () => {
  it('returns Weak for score <= 1', () => {
    expect(passwordStrength('a').label).toBe('Weak');
    expect(passwordStrength('').score).toBe(0);
    expect(passwordStrength('a').color).toBe('bg-red-500');
  });

  it('returns Fair for score 2', () => {
    const result = passwordStrength('abcdefgh');
    expect(result.score).toBe(2);
    expect(result.label).toBe('Fair');
    expect(result.color).toBe('bg-orange-500');
  });

  it('returns Good for score 3', () => {
    const result = passwordStrength('Abcdefgh');
    expect(result.score).toBe(3);
    expect(result.label).toBe('Good');
    expect(result.color).toBe('bg-blue-500');
  });

  it('returns Strong for score >= 4', () => {
    const result = passwordStrength('Abcd3fgh!');
    expect(result.score).toBe(5);
    expect(result.label).toBe('Strong');
    expect(result.color).toBe('bg-green-500');
  });

  it('checks all criteria correctly', () => {
    const result = passwordStrength('Abcd3fgh!');
    expect(result.checks).toEqual([
      { label: '8+ characters', met: true },
      { label: 'Contains lowercase', met: true },
      { label: 'Contains uppercase', met: true },
      { label: 'Contains number', met: true },
      { label: 'Contains special character', met: true },
    ]);
  });

  it('identifies weak passwords', () => {
    const result = passwordStrength('short');
    expect(result.score).toBe(1);
    expect(result.checks[0].met).toBe(false);
  });

  it('identifies missing lowercase', () => {
    const result = passwordStrength('ABCDEFGH');
    const check = result.checks.find(c => c.label === 'Contains lowercase');
    expect(check?.met).toBe(false);
  });

  it('identifies missing uppercase', () => {
    const result = passwordStrength('abcdefgh');
    const check = result.checks.find(c => c.label === 'Contains uppercase');
    expect(check?.met).toBe(false);
  });

  it('identifies missing number', () => {
    const result = passwordStrength('abcdefgh');
    const check = result.checks.find(c => c.label === 'Contains number');
    expect(check?.met).toBe(false);
  });

  it('identifies missing special character', () => {
    const result = passwordStrength('Abcdefgh1');
    const check = result.checks.find(c => c.label === 'Contains special character');
    expect(check?.met).toBe(false);
  });
});

describe('PasswordStrengthMeter', () => {
  it('renders password strength label', () => {
    render(<PasswordStrengthMeter password="Abcd3fgh!" />);
    expect(screen.getByText('Strong')).toBeInTheDocument();
  });

  it('renders all check items', () => {
    render(<PasswordStrengthMeter password="Abcd3fgh!" />);
    expect(screen.getByText('8+ characters')).toBeInTheDocument();
    expect(screen.getByText('Contains lowercase')).toBeInTheDocument();
    expect(screen.getByText('Contains uppercase')).toBeInTheDocument();
    expect(screen.getByText('Contains number')).toBeInTheDocument();
    expect(screen.getByText('Contains special character')).toBeInTheDocument();
  });

  it('renders check_circle for met criteria', () => {
    render(<PasswordStrengthMeter password="Abcd3fgh!" />);
    expect(screen.getAllByText('check_circle').length).toBe(5);
  });

  it('renders cancel for unmet criteria', () => {
    render(<PasswordStrengthMeter password="a" />);
    const cancels = screen.getAllByText('cancel');
    expect(cancels.length).toBeGreaterThan(0);
    expect(cancels.length).toBe(4);
  });
});