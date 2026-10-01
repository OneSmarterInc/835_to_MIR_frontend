import glob
import re
import sys

# 2026-10-01 - Yash: Task B3 - Per-call window CSRF coverage validation script

CSRF_MARKERS = ["getAuthHeaders", "withCsrf", "X-CSRFToken", "portalFetch"]

offenders = []

for filepath in glob.glob("src/**/*.js*", recursive=True):
    with open(filepath, encoding="utf-8", errors="ignore") as f:
        content = f.read()

    for match in re.finditer(r"\bfetch\(", content):
        start_pos = match.start()
        window = content[start_pos : start_pos + 900]

        # Check if this fetch call uses an unsafe HTTP method
        if re.search(r'method:\s*["\'](POST|PUT|PATCH|DELETE)', window, re.IGNORECASE):
            # Check if any CSRF marker is present in this 900-character window
            if not any(marker in window for marker in CSRF_MARKERS):
                line_num = content[:start_pos].count("\n") + 1
                offenders.append((filepath, line_num))

if offenders:
    print("Uncovered unsafe fetch call sites found:")
    for file_path, line_num in offenders:
        print(f"  - {file_path}:{line_num}")
    sys.exit(1)
else:
    print("0 misses: 100% per-call CSRF coverage verified across all fetch calls!")
    sys.exit(0)
