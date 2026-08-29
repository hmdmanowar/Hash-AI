// Contract + default policy only for v0.1 — nothing executes tool actions
// yet (see tools/Tool.ts), so there is nothing real to gate. This exists so
// the Permission Engine built in a later phase has a stable risk model to
// implement against, matching the PDF's risk table (section 11).
export type RiskLevel = 'low' | 'medium' | 'high' | 'prohibited'

export interface PermissionPolicy {
  // Whether an action at this risk level may run without asking a human.
  autoApprove: Record<RiskLevel, boolean>
}

export const DEFAULT_PERMISSION_POLICY: PermissionPolicy = {
  autoApprove: {
    low: true,
    medium: true,
    high: false,
    prohibited: false,
  },
}
