# Jarvis

An independent, model-agnostic AI agent runtime. Jarvis is a standalone product — it is not a feature of Hash Playground or any other single application. Other apps will eventually consume it through a stable interface (SDK/API), not by importing its internals.

This repo has no dependency on, and must never import from, the Hash Playground codebase.

## Status: v0.1 (Foundation + Brain) + Phase 2 (Memory) + Phase 3 (Tools) + a web UI

Done:
- Standalone TypeScript project, own git repo
- `AIModel` provider abstraction (`src/models/AIModel.ts`)
- One local model connected via [Ollama](https://ollama.com) (`src/models/OllamaModel.ts`)
- Basic multi-turn conversation (`src/core/Jarvis.ts`)
- Short-term (in-process) conversation memory (`src/memory/ShortTermMemory.ts`)
- **Persistent, user-controlled long-term memory** (`src/memory/LongTermMemory.ts`) — SQLite-backed (Node's built-in `node:sqlite`, no extra dependency), with keyword-overlap relevance retrieval fed back into every chat turn. Only written when you explicitly ask via `/remember` — never auto-extracted.
- **Real tools, sandboxed, behind an enforced Permission Engine** (`src/tools/`, `src/permissions/PermissionEngine.ts`) — `read_file`, `list_directory`, `write_file`, `search_code`, and `run_command`, all confined to a workspace root (`.jarvis/workspace/` by default) that no path can escape. Each tool has a fixed risk level (low/medium/high); low and medium run automatically, high (currently just `run_command`) always requires you to `/approve` or `/deny` it first. Every action — automatic or approved — is written to an append-only audit log (`.jarvis/audit.log`). This is **single-shot** tool use: the model can request one tool per turn, see the result, then must answer — not open-ended autonomous chaining. That's Phase 4.
- Persistent configuration via `.env` (`src/config/config.ts`)
- Tests (using a mock model, no Ollama dependency) and a CLI to try it for real
- A local HTTP API (`src/api/server.ts`, 127.0.0.1 only, no auth) and a React web chat UI (`web/`)

Not started yet (later phases): multi-step autonomous agent loop, vision, voice, autonomous developer mode (branches/builds/self-review), multi-agent roles, and 24/7 autonomous operation.

## Setup

1. Install [Ollama](https://ollama.com) and make sure it's running.
2. Pull the default model:
   ```
   ollama pull qwen2.5-coder
   ```
3. Install dependencies (also installs the `web/` frontend, via npm workspaces):
   ```
   npm install
   ```
4. Copy `.env.example` to `.env` (defaults already work; only edit it if you're using a different host/model, want the assistant to introduce itself under a different name via `JARVIS_NAME`, or want the memory database, tool sandbox, or audit log somewhere other than `.jarvis/`):
   ```
   cp .env.example .env
   ```

## Usage

**CLI:**
```
npm run chat
```
Interactive REPL. Ctrl+C to quit. Commands, in addition to normal chat:
- `/remember <text>` — store something permanently
- `/memories` — list everything stored, with ids
- `/forget <id>` — delete one
- `/approve` / `/deny` — resolve a pending high-risk tool request (e.g. after asking Jarvis to run a shell command)

**Web UI:** two terminals —
```
npm run api       # backend on http://127.0.0.1:4000
npm run web:dev   # frontend, Vite will print the URL (default http://localhost:5173)
```
The same commands above work by just typing them into the chat box — there's no separate memory or approval UI yet.

## Development

```
npm run typecheck   # tsc --noEmit
npm test            # vitest — does not require Ollama running
npm run build       # compile to dist/
```

## Architecture

```
src/
  config/       persistent configuration (.env)
  models/       AIModel interface + provider implementations (Ollama today; OpenAI/Claude/Gemini later)
  memory/       short-term (in-process) history + long-term (SQLite) memory
  tools/        concrete, sandboxed tools (filesystem, search, terminal) + the registry that
                describes them to the model
  permissions/  PermissionEngine — risk classification, auto-approve policy, and the
                append-only audit log
  core/         Jarvis orchestrator — wires config + model + memory + tools; handleInput() is
                the shared entry point for every interface (/remember, /memories, /forget,
                /approve, /deny)
  cli/          interactive chat REPL
  api/          local HTTP API (127.0.0.1 only)
  index.ts      public exports — the future SDK surface
web/            React + Vite chat frontend (own package.json/tsconfig, npm workspace)
```

`core/Jarvis.ts` depends only on the `AIModel` interface, never on a concrete provider — swapping or adding a model provider later means writing one new file under `models/`, not touching the core. Both the CLI and the API call `jarvis.handleInput()` rather than duplicating command parsing.

Tool-calling is a self-defined convention (`TOOL_CALL: {"tool": "...", "args": {...}}`, described to the model in the system prompt and parsed back out of its reply), not Ollama's native function-calling API — testing showed the default `qwen2.5-coder` doesn't reliably support that. This is also more portable: it works the same way regardless of which model is swapped in behind `AIModel`.
