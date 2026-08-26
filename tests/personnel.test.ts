import { describe, expect, test } from 'vitest';
import { headForDepartment } from '@/lib/personnel';

describe('headForDepartment', () => {
  test('returns the named head for departments that have one', () => {
    expect(headForDepartment('dept-diagmaps')).toEqual({
      id: 'head:dept-diagmaps',
      name: 'Nik',
      role: 'Operator',
      departmentId: 'dept-diagmaps',
    });
  });

  test('returns null for departments without a human lead yet', () => {
    expect(headForDepartment('dept-fieldops')).toBeNull();
    expect(headForDepartment('dept-dev')).toBeNull();
  });
});
