# Jarvis

An independent, model-agnostic AI agent runtime. Jarvis is a standalone product — it is not a feature of Hash Playground or any other single application. Other apps will eventually consume it through a stable interface (SDK/API), not by importing its internals.

This repo has no dependency on, and must never import from, the Hash Playground codebase.

## Status: v0.1 — Foundation + Brain

This is the first milestone from the Jarvis roadmap: a minimal, working core, not a feature-complete assistant.

Done:
- Standalone TypeScript project, own git repo
- `AIModel` provider abstraction (`src/models/AIModel.ts`)
- One local model connected via [Ollama](https://ollama.com) (`src/models/OllamaModel.ts`)
- Basic multi-turn conversation (`src/core/Jarvis.ts`)
- Short-term (in-process) conversation memory (`src/memory/ShortTermMemory.ts`)
- Persistent configuration via `.env` (`src/config/config.ts`)
- `Tool` and `Permission` interfaces — contracts only, nothing executes yet
- Tests (using a mock model, no Ollama dependency) and a CLI to try it for real

Not started yet (later phases): persistent/long-term memory, real tools (filesystem, terminal, browser, code), the agent planning/execution loop, vision, voice, autonomous developer mode, multi-agent roles, and 24/7 autonomous operation.

## Setup

1. Install [Ollama](https://ollama.com) and make sure it's running.
2. Pull the default model:
   ```
   ollama pull qwen2.5-coder
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Copy `.env.example` to `.env` (defaults already match the steps above; only edit it if you're using a different host/model, or want the assistant to introduce itself under a different name via `JARVIS_NAME`):
   ```
   cp .env.example .env
   ```

## Usage

```
npm run chat
```

Starts an interactive REPL against your local Ollama model. Ctrl+C to quit.

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
  memory/       short-term (in-process) conversation history
  tools/        Tool interface — contract only, no implementations yet
  permissions/  risk levels + default policy — contract only, not wired to anything yet
  core/         Jarvis orchestrator — wires config + model + memory
  cli/          interactive chat REPL
  index.ts      public exports — the future SDK surface
```

`core/Jarvis.ts` depends only on the `AIModel` interface, never on a concrete provider — swapping or adding a model provider later means writing one new file under `models/`, not touching the core.
