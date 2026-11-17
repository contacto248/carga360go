---
description: "Practical tips for using Cursor IDE together with Grok for CARGA360GO development"
connections: [project-context, agent-workflows]
---

# Cursor + Grok Tips

## Effective Session Patterns

1. **Start with context**: Paste or reference current priority, blockers, and relevant file paths.
2. **Be specific**: Request incremental changes rather than full rewrites unless needed.
3. **Iterate visibly**: After each change, verify it advances the page and document it.
4. **Use Grok for reasoning**: Architecture decisions, edge cases, and coordination notes.
5. **Use Cursor for execution**: Actual code edits, multi-file changes, and local testing.

## Prompt Examples for Cursor + Grok

- "Given the current priority to unblock X on carga360go.cl, propose the smallest change that moves us forward, then implement it."
- "Review this component for the Carga360go page. Suggest improvements aligned with building visible progress, then apply the top ones."
- "Coordinate: the bot will monitor Y; meanwhile, in Cursor, implement Z."

## Best Practices

| Practice | Why It Helps |
|----------|--------------|
| Small, reviewable diffs | Easier to validate and roll back |
| Explicit handoffs | Clear ownership between agents |
| Status notes in code or docs | Shared context for bots and future sessions |
| Prefer visible UI/progress | Aligns with "construir en la página" goal |
| Capture decisions inline | Reduces repeated questions |

## Common Pitfalls to Avoid

- Staying in pure planning mode when build has been requested
- Generating large untested changes without checkpoints
- Losing context between Cursor sessions and bot memory
- Ignoring pending owner decisions

When patterns repeat (e.g., specific component types, deployment steps, or status formats), propose extracting them into project-specific references or a custom skill.
