"""Chạy bộ C1 riêng; dùng call_case của khung, không sửa khung hoặc benchmark CP2."""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "eval"))
import run_eval


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--code-root", type=Path, default=ROOT,
                        help="Worktree chứa phiên bản sản phẩm cần đo; output vẫn lưu cạnh benchmark.")
    args = parser.parse_args()
    code_root = args.code_root.resolve()
    folder = ROOT / "eval" / "heldout"
    bench = folder / "benchmark.csv"
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    if hashlib.sha256(bench.read_bytes().replace(b"\r\n", b"\n")).hexdigest() != manifest["sha256_lf"]:
        raise SystemExit("Bộ heldout khác bản đã chốt; không chạy.")
    with bench.open(encoding="utf-8-sig", newline="") as f:
        items = list(csv.DictReader(f))
    ids = [r["id"] for r in items]
    if len(items) != manifest["rows"] or len(set(ids)) != len(ids):
        raise SystemExit("Sai số câu hoặc trùng ID; không chạy.")
    n = max([int(m[1]) for p in folder.glob("run-*.csv")
             if (m := re.fullmatch(r"run-(\d+)\.csv", p.name))] or [0]) + 1
    name = f"run-{n}"
    run_id = f"heldout-{n}@{datetime.now():%Y%m%d-%H%M%S}"
    trace_folder = ROOT / "traces" / "heldout"
    trace_folder.mkdir(parents=True, exist_ok=True)
    sources = list((code_root / "codebase").glob("*.py")) + [code_root / "data" / "cong_vien_mau.json"]
    context = {"run_id": run_id, "started_at": datetime.now(timezone.utc).isoformat(),
               "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=code_root, text=True).strip(),
               "benchmark_sha256_lf": manifest["sha256_lf"], "ids": ids,
               "source_sha256": {p.relative_to(code_root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                                 for p in sources}}
    with (folder / f"{name}-context.json").open("x", encoding="utf-8") as f:
        json.dump(context, f, ensure_ascii=False, indent=2)
        f.write("\n")
    run_eval.CODEBASE = str(code_root / "codebase")
    answer, tracing = run_eval.load_answer()
    rows = []
    with (folder / f"{name}.csv").open("x", encoding="utf-8-sig", newline="") as f, \
            (trace_folder / f"{name}.jsonl").open("x", encoding="utf-8") as trace:
        writer = csv.DictWriter(f, fieldnames=run_eval.OUT_COLS)
        writer.writeheader()
        trace.write(json.dumps({"run_id": run_id, "case": "", "kind": "bench", "ids": ids}, ensure_ascii=False) + "\n")
        for i, item in enumerate(items, 1):
            row, events = run_eval.call_case(answer, tracing, item["id"], item["input"])
            row.update({"run_id": run_id, **{k: item[k] for k in ("id", "type", "input", "expected", "pass_criterion")},
                        "pass": "", "ghi_chu": ""})
            writer.writerow(row)
            events = list(events) + [{"kind": "final", "output": row["output"], "error": row["error"]}]
            for event in events:
                trace.write(json.dumps({"run_id": run_id, "case": item["id"], **event}, ensure_ascii=False) + "\n")
            f.flush()
            trace.flush()
            rows.append(row)
            print(f"[{i}/{len(items)}] {item['id']}: " + (row["error"] or "xong"), flush=True)
    totals = {k: sum(r[k] for r in rows) for k in ("model_calls", "tool_calls", "tokens_in", "tokens_out")}
    errors = sum(bool(r["error"]) for r in rows)
    print(json.dumps({"run_id": run_id, "cases": len(rows), "errors": errors, **totals}, ensure_ascii=False))
    return int(errors > 0 or run_eval.looks_mock(rows))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
