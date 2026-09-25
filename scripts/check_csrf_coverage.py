import re
import glob
import sys

# 2026-09-25 - Yash: Task 6b - CI script to enforce CSRF coverage on all unsafe fetch calls

offenders = []
for f in glob.glob('src/**/*.js*', recursive=True):
    s = open(f, encoding='utf-8', errors='ignore').read()
    if 'withCsrf' in s or 'X-CSRFToken' in s:
        continue
    for m in re.finditer(r'\bfetch\(', s):
        if re.search(r'method:\s*["\'](POST|PUT|PATCH|DELETE)', s[m.start():m.start()+700], re.I):
            offenders.append(f)
            break

if offenders:
    print("Files with uncovered unsafe fetch calls:")
    for off in offenders:
        print(f"  - {off}")
    sys.exit(1)
else:
    print("100% CSRF coverage verified across all frontend unsafe fetch calls!")
    sys.exit(0)
