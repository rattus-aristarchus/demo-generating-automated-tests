# /// script
# requires-python = ">=3.10"
# dependencies = ["fastmcp"]
# ///
"""demo-tms — a minimal mock TMS served over MCP (stdio transport).

Serves manual test cases from test-cases.json for the "test case -> autotest"
demo: in production any TMS can sit behind the same two-tool contract.
"""

import json
from pathlib import Path

from fastmcp import FastMCP

DATA_FILE = Path(__file__).parent / "test-cases.json"
REQUIRED_FIELDS = {"id", "name", "description", "precondition", "scenario", "custom_fields"}


def load_testcases(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"demo-tms: data file not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"demo-tms: invalid JSON in {path}: {exc}") from exc
    if not isinstance(data, dict) or not all(isinstance(case, dict) for case in data.values()):
        raise SystemExit(f"demo-tms: {path} must be a JSON object keyed by test case ID")
    for key, case in data.items():
        if missing := REQUIRED_FIELDS - case.keys():
            raise SystemExit(f"demo-tms: test case {key!r} is missing fields: {sorted(missing)}")
    return data


TESTCASES = load_testcases(DATA_FILE)

mcp = FastMCP("demo-tms")


@mcp.tool
def get_testcase(id: str) -> dict:
    """Return the full test case by ID (e.g. "TC-01"): name, description, precondition, scenario steps, parameters (if any), custom fields."""
    if id not in TESTCASES:
        raise ValueError(f"Test case {id!r} not found. Known IDs: {', '.join(sorted(TESTCASES))}")
    return TESTCASES[id]


@mcp.tool
def find_testcases(query: str) -> list[dict]:
    """Search test cases by name (case-insensitive substring). Returns id, name, feature and story for each match."""
    query = query.casefold()
    return [
        {
            "id": case["id"],
            "name": case["name"],
            "feature": case["custom_fields"].get("Feature", ""),
            "story": case["custom_fields"].get("Story", ""),
        }
        for case in TESTCASES.values()
        if query in case["name"].casefold()
    ]


if __name__ == "__main__":
    mcp.run()
