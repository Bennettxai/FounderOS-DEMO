import { describe, expect, test } from 'vitest';
import {
  AgentSchema,
  DepartmentSchema,
  ToolSchema,
} from '@/lib/schemas';

describe('AgentSchema', () => {
  const valid = {
    id: 'agent-zernio-poster',
    departmentId: 'dept-marketing',
    name: 'Zernio Poster',
    role: 'Social Distribution',
    status: 'active',
    tier: 'specialist',
    description: 'Schedules and publishes content across IG, TikTok, YouTube, FB, LinkedIn, X.',
    model: 'claude-fable-5',
    tools: ['zernio', 'whisper'],
    parentId: null,
    instance: 'builtin',
  };

  test('accepts a valid agent', () => {
    expect(AgentSchema.parse(valid)).toEqual(valid);
  });

  test('rejects an unknown status', () => {
    expect(() => AgentSchema.parse({ ...valid, status: 'sleeping' })).toThrow();
  });

  test('rejects an unknown tier', () => {
    expect(() => AgentSchema.parse({ ...valid, tier: 'intern' })).toThrow();
  });

  test('rejects a missing departmentId', () => {
    const { departmentId: _omitted, ...rest } = valid;
    expect(() => AgentSchema.parse(rest)).toThrow();
  });
});

describe('DepartmentSchema', () => {
  test('accepts a valid department', () => {
    const dept = {
      id: 'dept-marketing',
      name: 'Marketing & Growth',
      slug: 'marketing',
      tagline: 'Attention is the asset.',
      color: '#ec4899',
      order: 3,
    };
    expect(DepartmentSchema.parse(dept)).toEqual(dept);
  });

  test('rejects a non-numeric order', () => {
    expect(() =>
      DepartmentSchema.parse({
        id: 'd',
        name: 'X',
        slug: 'x',
        tagline: '',
        color: '#fff',
        order: 'first',
      }),
    ).toThrow();
  });
});



describe('ToolSchema', () => {
  test('rejects an unknown integration status', () => {
    expect(() =>
      ToolSchema.parse({
        id: 'tool-zernio',
        name: 'Zernio',
        category: 'Distribution',
        status: 'maybe',
        color: '#22d3ee',
        description: '',
      }),
    ).toThrow();
  });
});


