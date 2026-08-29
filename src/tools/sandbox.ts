import { resolve, relative, isAbsolute } from 'node:path'

export class SandboxViolationError extends Error {
  constructor(requestedPath: string) {
    super(`Path "${requestedPath}" is outside the sandboxed workspace root`)
    this.name = 'SandboxViolationError'
  }
}

// Resolves a model-supplied path against the workspace root and rejects
// anything that would escape it — "../../elsewhere", an absolute path
// pointing outside the root, or (on Windows) a different drive entirely.
// This is the one thing every file/terminal tool depends on for safety, so
// it lives in its own tiny, easy-to-audit module rather than being
// duplicated per tool.
export function resolveSandboxedPath(workspaceRoot: string, requestedPath: string): string {
  const resolvedRoot = resolve(workspaceRoot)
  const resolvedTarget = resolve(resolvedRoot, requestedPath)
  const rel = relative(resolvedRoot, resolvedTarget)

  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new SandboxViolationError(requestedPath)
  }

  return resolvedTarget
}
