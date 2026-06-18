import { describe, it, expect } from 'vitest';

describe('can() permission helper', () => {
  // Test the logic that would be in the context
  function can(user: any, perm: string): boolean {
    return user?.permissions?.includes(perm) ?? false;
  }

  it('returns true if user has permission', () => {
    const user = { permissions: ['execution:approve', 'flow:read'] };
    expect(can(user, 'execution:approve')).toBe(true);
    expect(can(user, 'flow:read')).toBe(true);
  });

  it('returns false if user lacks permission', () => {
    const user = { permissions: ['execution:approve'] };
    expect(can(user, 'flow:create')).toBe(false);
    expect(can(user, 'settings:write')).toBe(false);
  });

  it('returns false if user is null', () => {
    expect(can(null, 'execution:approve')).toBe(false);
  });

  it('returns false if permissions is empty', () => {
    const user = { permissions: [] };
    expect(can(user, 'anything')).toBe(false);
  });
});

describe('isReader computation', () => {
  function can(user: any, perm: string): boolean {
    return user?.permissions?.includes(perm) ?? false;
  }
  function isReader(user: any): boolean {
    return !!(user && !can(user, 'flow:create'));
  }

  it('reader is true for viewer', () => {
    const user = { permissions: ['execution:approve'] };
    expect(isReader(user)).toBe(true);
  });

  it('reader is false for admin', () => {
    const user = { permissions: ['flow:create', 'execution:approve'] };
    expect(isReader(user)).toBe(false);
  });

  it('reader is false for editor', () => {
    const user = { permissions: ['flow:create', 'flow:edit'] };
    expect(isReader(user)).toBe(false);
  });

  it('reader is false when user is null', () => {
    expect(isReader(null)).toBe(false);
  });
});

describe('backHref computation', () => {
  function can(user: any, perm: string): boolean {
    return user?.permissions?.includes(perm) ?? false;
  }
  function backHref(user: any): string {
    return user && !can(user, 'flow:create') ? '/approvals' : '/';
  }

  it('returns /approvals for viewer', () => {
    const user = { permissions: ['execution:approve'] };
    expect(backHref(user)).toBe('/approvals');
  });

  it('returns / for admin', () => {
    const user = { permissions: ['flow:create'] };
    expect(backHref(user)).toBe('/');
  });

  it('returns / when user is null', () => {
    expect(backHref(null)).toBe('/');
  });
});
