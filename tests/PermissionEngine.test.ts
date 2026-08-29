import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PermissionEngine, DEFAULT_PERMISSION_POLICY } from '../src/permissions/PermissionEngine.js'

describe('PermissionEngine', () => {
  let dir: string
  let auditLogPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jarvis-audit-test-'))
    auditLogPath = join(dir, 'audit.log')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('matches the roadmap risk table by default: low/medium auto-approve, high/prohibited do not', () => {
    const engine = new PermissionEngine(auditLogPath)
    expect(engine.needsApproval('low')).toBe(false)
    expect(engine.needsApproval('medium')).toBe(false)
    expect(engine.needsApproval('high')).toBe(true)
    expect(engine.needsApproval('prohibited')).toBe(true)
  })

  it('respects a custom policy', () => {
    const strictPolicy = { autoApprove: { ...DEFAULT_PERMISSION_POLICY.autoApprove, medium: false } }
    const engine = new PermissionEngine(auditLogPath, strictPolicy)
    expect(engine.needsApproval('medium')).toBe(true)
  })

  it('record() appends one JSON line per call, creating the log file and its directory', () => {
    const nestedPath = join(dir, 'nested', 'audit.log')
    const engine = new PermissionEngine(nestedPath)

    engine.record({ tool: 'read_file', args: { path: 'a.txt' }, risk: 'low', outcome: 'success', approvedBy: 'auto' })
    engine.record({ tool: 'run_command', args: { command: 'ls' }, risk: 'high', outcome: 'success', approvedBy: 'user' })

    expect(existsSync(nestedPath)).toBe(true)
    const lines = readFileSync(nestedPath, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)

    const first = JSON.parse(lines[0])
    expect(first.tool).toBe('read_file')
    expect(first.approvedBy).toBe('auto')
    expect(typeof first.timestamp).toBe('string')
  })
})
