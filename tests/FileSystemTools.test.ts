import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileSystemTools } from '../src/tools/FileSystemTools.js'
import { SandboxViolationError } from '../src/tools/sandbox.js'

describe('FileSystemTools', () => {
  let workspaceRoot: string

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'jarvis-fs-test-'))
  })

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true })
  })

  it('write_file then read_file round-trips content inside the sandbox', async () => {
    const [, , writeFileTool] = createFileSystemTools(workspaceRoot)
    const [readFileTool] = createFileSystemTools(workspaceRoot)

    await writeFileTool.execute({ path: 'notes.txt', content: 'hello jarvis' })
    const result = await readFileTool.execute({ path: 'notes.txt' })

    expect(result.content).toBe('hello jarvis')
  })

  it('write_file creates parent directories as needed', async () => {
    const [, , writeFileTool] = createFileSystemTools(workspaceRoot)
    const [readFileTool] = createFileSystemTools(workspaceRoot)

    await writeFileTool.execute({ path: 'nested/deep/file.txt', content: 'x' })
    const result = await readFileTool.execute({ path: 'nested/deep/file.txt' })

    expect(result.content).toBe('x')
  })

  it('list_directory lists what was written', async () => {
    const [, listDirectoryTool, writeFileTool] = createFileSystemTools(workspaceRoot)
    await writeFileTool.execute({ path: 'a.txt', content: '1' })
    await writeFileTool.execute({ path: 'b.txt', content: '2' })

    const result = await listDirectoryTool.execute({})
    expect(result.entries.sort()).toEqual(['a.txt', 'b.txt'])
  })

  it('rejects a path that tries to escape the sandbox with ../', async () => {
    const [readFileTool] = createFileSystemTools(workspaceRoot)
    await expect(readFileTool.execute({ path: '../../outside.txt' })).rejects.toThrow(SandboxViolationError)
  })

  it('rejects an absolute path outside the sandbox', async () => {
    const [, , writeFileTool] = createFileSystemTools(workspaceRoot)
    const outsidePath = process.platform === 'win32' ? 'C:\\Windows\\system.txt' : '/etc/passwd'
    await expect(writeFileTool.execute({ path: outsidePath, content: 'x' })).rejects.toThrow(SandboxViolationError)
  })

  it('declares the expected risk levels', () => {
    const [readFileTool, listDirectoryTool, writeFileTool] = createFileSystemTools(workspaceRoot)
    expect(readFileTool.risk).toBe('low')
    expect(listDirectoryTool.risk).toBe('low')
    expect(writeFileTool.risk).toBe('medium')
  })
})
