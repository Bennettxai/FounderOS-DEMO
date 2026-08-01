/**
 * Human personnel that run departments. Panel-only data (NOT graph nodes — those
 * were intentionally kept out of the force graph). Add a person as that part of
 * the org gets a real human lead.
 */
export type Personnel = { id: string; name: string; role: string; departmentId: string };

export const DEPARTMENT_HEADS: Record<string, { name: string; role: string }> = {
  'dept-sales': { name: 'Marco', role: 'Head of Sales' },
  'dept-marketing-growth': { name: 'Nadia', role: 'Head of Growth & Marketing' },
};

export function headForDepartment(departmentId: string): Personnel | null {
  const h = DEPARTMENT_HEADS[departmentId];
  return h ? { id: `head:${departmentId}`, name: h.name, role: h.role, departmentId } : null;
}
