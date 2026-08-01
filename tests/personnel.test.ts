import { describe, expect, test } from 'vitest';
import { headForDepartment } from '@/lib/personnel';

describe('headForDepartment', () => {
  test('returns the named head for departments that have one', () => {
    expect(headForDepartment('dept-sales')).toEqual({
      id: 'head:dept-sales',
      name: 'Marco',
      role: 'Head of Sales',
      departmentId: 'dept-sales',
    });
    expect(headForDepartment('dept-marketing-growth')?.name).toBe('Nadia');
  });

  test('returns null for departments without a human lead yet', () => {
    expect(headForDepartment('dept-tech')).toBeNull();
    expect(headForDepartment('dept-finance')).toBeNull();
  });
});
