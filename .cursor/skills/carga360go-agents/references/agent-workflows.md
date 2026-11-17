---
description: "Step-by-step multi-agent workflows for coordinating Cursor, Grok, and Grok Bots on CARGA360GO"
connections: [project-context, cursor-grok-tips]
---

# Agent Workflows

## Core Coordination Pattern

1. **User sets priority** (drafts, unblock, build, decide)
2. **Grok interprets and plans** — clarifies scope, proposes steps
3. **Grok Bots handle persistence** — routines, memory, scheduled checks, monitoring
4. **Cursor + Grok execute** — code generation, edits, implementation
5. **Report & iterate** — summarize progress, update context

## Unblocking Workflow

1. List known blockers and pending decisions
2. For each: gather context, propose 1–3 resolution options
3. Recommend a path and concrete next action
4. Assign: which part goes to Cursor/Grok vs. Bot routine
5. Execute the highest-priority unblocking action
6. Document outcome

## Building Workflow

1. Confirm the feature or page section to advance
2. Break into small, visible increments
3. Use Cursor for implementation with Grok assistance
4. Test or review the change
5. Update project status (via bot or notes)
6. Identify next increment

## Routine Setup (Grok Bots)

When creating a bot routine for the project:

- Name it clearly (e.g., "Carga360go Daily Progress" or "Contacto Carga360GO Summary")
- Define cadence (daily summary, on-demand, etc.)
- Specify exact content: blockers, decisions needed (including from "el dueño"), progress made on the page, next concrete build steps
- Include how to hand off to Cursor/Grok for action
- Ensure memory of prior context is available
- Prefer routines that surface "destrabar" items and visible progress

## Multi-Agent Handoff

- **From User → Grok**: Priority (drafts only vs. construir) and context
- **From Grok → Bot**: Persistent monitoring or recurring report (e.g. daily summary requested by "contacto carga 360 Go")
- **From Grok/Bot → Cursor**: Specific implementation tasks with clear requirements (calculadora, publicación, verificación, etc.)
- **Back to User**: Concise status with decisions needed or progress visible

Always prefer concrete progress ("empiecen a construir en la página") over additional planning when the user has instructed to build.
