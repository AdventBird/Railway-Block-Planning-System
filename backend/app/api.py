"""API Router and Dispatcher for Railway Block Planning System.

Exposes canonical JSON REST endpoints:
- POST /api/evaluate: Run multi-mode baseline comparison (Feature 28)
- GET  /api/scenarios: List demo scenarios metadata (Feature 30)
- POST /api/scenarios/run: Execute a deterministic demo scenario (Feature 30)
- POST /api/replan: Execute event-driven replanning (Feature 19)

Includes standalone HTTP server handling without external dependencies.
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse

from backend.app.services.evaluation import EvaluationEngine
from backend.app.services.planner import Planner
from backend.app.services.replanning import ReplanningEngine
from backend.app.services.scenarios import ScenarioEngine


def handle_evaluate(body: Dict[str, Any]) -> Dict[str, Any]:
    """Handler for POST /api/evaluate."""
    scenario_id = body.get("scenario_id")
    modes = body.get("modes")
    jobs = body.get("jobs")
    windows = body.get("windows")
    compat_groups = body.get("compat_groups")
    train_movements = body.get("train_movements") or body.get("timetable")
    locked_assignments = body.get("locked_assignments")
    supported_departments = body.get("supported_departments")

    return EvaluationEngine.evaluate(
        scenario_id=scenario_id,
        modes=modes,
        jobs=jobs,
        windows=windows,
        compat_groups=compat_groups,
        train_movements=train_movements,
        locked_assignments=locked_assignments,
        supported_departments=supported_departments,
    )


def handle_get_scenarios() -> Dict[str, Any]:
    """Handler for GET /api/scenarios."""
    return {
        "scenarios": ScenarioEngine.list_scenarios()
    }


def handle_run_scenario(body: Dict[str, Any]) -> Dict[str, Any]:
    """Handler for POST /api/scenarios/run."""
    scenario_id = body.get("scenario_id") or body.get("id") or "normal"
    return ScenarioEngine.run_scenario(str(scenario_id))


def handle_replan(body: Dict[str, Any]) -> Dict[str, Any]:
    """Handler for POST /api/replan."""
    current_plan = body.get("current_plan") or body.get("plan") or {}
    current_jobs = body.get("current_jobs") or body.get("jobs") or []
    windows = body.get("windows") or body.get("block_windows") or []
    event = body.get("event") or {}
    train_movements = body.get("train_movements") or body.get("timetable")
    compat_groups = body.get("compat_groups")
    locked_assignments = body.get("locked_assignments")
    supported_departments = body.get("supported_departments")
    mode = body.get("mode", "BALANCED")

    result = ReplanningEngine.replan(
        current_plan=current_plan,
        current_jobs=current_jobs,
        windows=windows,
        event=event,
        train_movements=train_movements,
        compat_groups=compat_groups,
        locked_assignments=locked_assignments,
        supported_departments=supported_departments,
        mode=mode,
    )
    return result.to_dict()


def dispatch_request(method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Tuple[int, Dict[str, Any]]:
    """Dispatch API request to corresponding controller function."""
    clean_path = urlparse(path).path.rstrip("/")

    if method == "GET" and clean_path == "/api/scenarios":
        return 200, handle_get_scenarios()

    elif method == "POST" and clean_path == "/api/evaluate":
        payload = body or {}
        return 200, handle_evaluate(payload)

    elif method == "POST" and clean_path in ("/api/scenarios/run", "/api/scenarios"):
        payload = body or {}
        return 200, handle_run_scenario(payload)

    elif method == "POST" and clean_path == "/api/replan":
        payload = body or {}
        return 200, handle_replan(payload)

    return 404, {"error": "Not Found", "path": clean_path, "method": method}


class RailwayApiHandler(BaseHTTPRequestHandler):
    """Zero-dependency HTTP Request Handler for Railway Planning API."""

    def _send_json(self, status_code: int, data: Dict[str, Any]) -> None:
        response_bytes = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(response_bytes)

    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        status_code, data = dispatch_request("GET", self.path)
        self._send_json(status_code, data)

    def do_POST(self) -> None:
        content_len = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_len) if content_len > 0 else b"{}"
        try:
            body = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
        except Exception:
            body = {}
        status_code, data = dispatch_request("POST", self.path, body)
        self._send_json(status_code, data)


def run_server(port: int = 8000) -> None:
    """Run local development server."""
    server_address = ("", port)
    httpd = HTTPServer(server_address, RailwayApiHandler)
    print(f"Railway Planning API running on port {port}...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    run_server()
