import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

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

export interface AuditEntry {
  timestamp: string
  tool: string
  args: Record<string, unknown>
  risk: RiskLevel
  outcome: 'success' | 'error' | 'denied'
  approvedBy: 'auto' | 'user'
  detail?: string
}

// Real enforcement, replacing the old contract-only stub (Permission.ts) —
// every tool declares its own fixed `risk` (see tools/Tool.ts), and this
// engine is the single place that decides whether that risk needs a human
// in the loop, plus the append-only audit trail the roadmap's safety
// section calls for: identity/timestamp/tool/arguments/risk/outcome per
// action, whether it ran automatically or after approval.
export class PermissionEngine {
  constructor(
    private readonly auditLogPath: string,
    private readonly policy: PermissionPolicy = DEFAULT_PERMISSION_POLICY,
  ) {}

  needsApproval(risk: RiskLevel): boolean {
    return !this.policy.autoApprove[risk]
  }

  record(entry: Omit<AuditEntry, 'timestamp'>): void {
    const full: AuditEntry = { timestamp: new Date().toISOString(), ...entry }
    mkdirSync(dirname(this.auditLogPath), { recursive: true })
    appendFileSync(this.auditLogPath, JSON.stringify(full) + '\n', 'utf8')
  }
}
