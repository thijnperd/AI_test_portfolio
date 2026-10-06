---
name: mcp-builder
description: Use when the user asks to design, build, or improve an MCP (Model Context Protocol) server or integrate an external API/tool so agents can call it. Not for consuming MCP tools already available or for ordinary API client code inside an app.
version: 1.0.0
user-invocable: true
argument-hint: "[service or API to expose as MCP tools]"
---

# MCP builder — small, honest, typed tools

## Design

1. **Tool surface from user jobs.** Enumerate the 3–8 operations an agent
   actually needs (search, get, create, update), not one tool per API endpoint.
2. **Names and descriptions are the UI.** Tool names are verbs
   (`search_orders`, `get_order`); descriptions state when to use the tool and
   when not to. The agent routes on this text.
3. **Typed, validated inputs.** Every parameter: type, range, required/optional,
   and semantics in the description. Reject bad input with actionable errors.
4. **Bounded outputs.** Return the smallest payload that answers the need
   (ids + summaries first, full records on request). Agents choke on megabyte
   responses.
5. **Honest errors.** Distinguish "not found", "not permitted", "upstream
   failed", and "invalid input" — never a generic 500 string.
6. **Safety.** Read vs write tools separated; destructive operations require
   explicit confirmation fields; secrets via environment variables only.

## Implementation

- Prefer the official SDK for the target language; keep the server stateless.
- Idempotency for retries on any write tool; pagination for any list tool.
- Deterministic ordering of results so agents can rely on them.
- Include one worked example per tool in the README (request + response).

## Verification

- Exercise each tool once with valid input and once with invalid input.
- Confirm the tool list an agent sees reads well out loud: could a stranger
  pick the right tool from names and descriptions alone?

## Examples

- "Expose our ticketing API to agents" → tools: `search_tickets`,
  `get_ticket`, `create_ticket`, `add_comment`; `delete_*` behind confirmation.
- "Review my MCP server design" → check tool count, naming, input schemas,
  output bounds, and error taxonomy against this checklist.
