# demo-tms — a mock TMS behind a local MCP server

A minimal local MCP server (Python + FastMCP, stdio transport) that serves manual test cases from a JSON file. It stands in for "any TMS" in the *test case → autotest* demo: the agent fetches a case through two MCP tools exactly as it would from a production TMS integration. No ports, no Docker, no deployment — the MCP client launches the server as a child process.

## Files

- `server.py` — FastMCP server `demo-tms` exposing two tools: `get_testcase(id)` and `find_testcases(query)`.
- `test-cases.json` — test case data keyed by ID. Converted from a real TMS export (login feature; case text in Russian, `Feature`/`Story` custom fields in English to match the e2e repo structure). IDs are `TC-01…TC-11`; `TC-01` is the happy-path login case used in the demo.
- `.mcp.json` — client registration template with paths relative to the repo root (Windows venv layout; on macOS/Linux use `.venv/bin/python`).
- `automating-testcases-demo.md` — the `automating-testcases` skill with step 1 patched to use the `demo-tms` tools (steps 2–8 unchanged).

## Setup

```bash
python -m venv .venv
.venv/Scripts/python -m pip install fastmcp      # Windows
# .venv/bin/python -m pip install fastmcp        # Linux/macOS
```

Skip if `.venv/` already exists in this folder.

## Register the server

Merge the `mcpServers` block from `.mcp.json` into your MCP client's configuration (or point the client at this file, e.g. as a project-level `.mcp.json`). The paths are relative to the repo root, so the client must resolve them against the workspace — if your client resolves them differently, restore absolute paths in your local copy. After registering, the client should list server `demo-tms` as connected with both tools.

## Verify

Option A — MCP Inspector:

```bash
npx @modelcontextprotocol/inspector mock-tms/.venv/Scripts/python.exe mock-tms/server.py   # run from the repo root
```

In the Inspector UI: connect, confirm tools `get_testcase` and `find_testcases` are listed, then call `get_testcase` with `{ "id": "TC-01" }` — it should return the full case.

Option B — direct smoke call from Python (run from this folder; uses the actual `.mcp.json`):

```python
import asyncio, json
from fastmcp import Client

async def main():
    config = json.load(open(".mcp.json", encoding="utf-8"))
    async with Client(config) as client:
        print([t.name for t in await client.list_tools()])
        result = await client.call_tool("get_testcase", {"id": "TC-01"})
        print(result.content[0].text[:300])

asyncio.run(main())
```

## Run the demo

1. Register the server and make sure the client shows `demo-tms` as connected.
2. Make sure the agent has the patched skill (`automating-testcases-demo.md`) available.
3. Prompt: **«автоматизируй кейс TC-01»**.
4. Expected flow: the skill triggers → the agent calls `mcp__demo-tms__get_testcase` with `{ "id": "TC-01" }` → receives the full case (name, description, precondition, scenario steps, Feature/Story) → presents the analysis and proceeds to locating the target spec. If the user gives a case name instead of an ID, the agent searches first via `mcp__demo-tms__find_testcases`.
