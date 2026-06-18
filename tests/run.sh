#!/usr/bin/env bash
# dlint rule test harness — scalable TP/FP gate.
# Convention: each tests/fixtures/<rule>.fixture.ts(x) is linted with `--rules <rule>`.
#   Lines marked `// EXPECT: <rule>` MUST be flagged (true positives).
#   Every other line MUST NOT be flagged (negative near-misses → false-positive guard).
# Add a rule's coverage = drop a <rule>.fixture.ts(x) file. No harness edits needed.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
CLI="$ROOT/build/cli.js"
ONLY="${1:-}"

pass=0; fail=0; failed=""
for fx in "$DIR"/fixtures/*.fixture.ts "$DIR"/fixtures/*.fixture.tsx; do
  [ -e "$fx" ] || continue
  base="$(basename "$fx")"
  rule="${base%.fixture.ts}"; rule="${rule%.fixture.tsx}"
  [ -n "$ONLY" ] && [ "$ONLY" != "$rule" ] && continue
  expected="$(python3 -c '
import sys, re
exp = []
for i, line in enumerate(open(sys.argv[1]), 1):
    m = re.search(r"//\s*EXPECT:\s*[a-z][a-z0-9-]*(?:@(\d+))?", line)
    if m:
        exp.append(int(m.group(1)) if m.group(1) else i)
print(" ".join(str(x) for x in sorted(set(exp))))
' "$fx")"
  actual="$(node "$CLI" --path "$DIR" --rules "$rule" --files "fixtures/$base" --format json --no-error 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(' '.join(str(l) for l in sorted(set(x['line'] for x in d.get('diagnostics',[])))))" 2>/dev/null | xargs)"
  if [ "$expected" = "$actual" ]; then
    pass=$((pass+1)); echo "PASS  $rule  [$expected]"
  else
    fail=$((fail+1)); failed="$failed $rule"
    echo "FAIL  $rule  | expected:[$expected]  actual:[$actual]"
  fi
done

# route-boundary needs an app/<route>/ layout: the rule keys off path segments relative to the
# program root (getCurrentDirectory = process.cwd()), so its fixture lives in a dedicated island
# and runs from that dir. Not expressible in the flat fixtures/ harness.
RB_ISLAND="$DIR/route-boundary-island"
RB_FILE="app/dashboard/importer.ts"
if [ -f "$RB_ISLAND/$RB_FILE" ] && { [ -z "$ONLY" ] || [ "$ONLY" = "route-boundary" ]; }; then
  expected="$(python3 -c '
import sys, re
exp = []
for i, line in enumerate(open(sys.argv[1]), 1):
    m = re.search(r"//\s*EXPECT:\s*[a-z][a-z0-9-]*(?:@(\d+))?", line)
    if m:
        exp.append(int(m.group(1)) if m.group(1) else i)
print(" ".join(str(x) for x in sorted(set(exp))))
' "$RB_ISLAND/$RB_FILE")"
  actual="$( (cd "$RB_ISLAND" && node "$CLI" --path . --rules route-boundary --files "$RB_FILE" --format json --no-error 2>/dev/null) \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(' '.join(str(l) for l in sorted(set(x['line'] for x in d.get('diagnostics',[])))))" 2>/dev/null | xargs)"
  if [ "$expected" = "$actual" ]; then
    pass=$((pass+1)); echo "PASS  route-boundary  [$expected]"
  else
    fail=$((fail+1)); failed="$failed route-boundary"
    echo "FAIL  route-boundary  | expected:[$expected]  actual:[$actual]"
  fi
fi

# config-resolve: prove `dlint --config <file>` resolves rulesDir + a SUBDIR tsconfig relative to
# the config's directory (not the cwd), so the same config runs from anywhere on anything. Runs from
# ROOT (cwd != config dir); without the dirname(tsconfig) basePath fix the program is empty → 0.
CR_CFG="$DIR/config-resolve-island.dlint.config.ts"
CR_FILE="config-resolve-island/src/sample.ts"
if [ -f "$CR_CFG" ] && { [ -z "$ONLY" ] || [ "$ONLY" = "config-resolve" ]; }; then
  expected="$(python3 -c '
import sys, re
exp = []
for i, line in enumerate(open(sys.argv[1]), 1):
    m = re.search(r"//\s*EXPECT:\s*[a-z][a-z0-9-]*(?:@(\d+))?", line)
    if m:
        exp.append(int(m.group(1)) if m.group(1) else i)
print(" ".join(str(x) for x in sorted(set(exp))))
' "$DIR/$CR_FILE")"
  actual="$( (cd "$ROOT" && node "$CLI" --config "$CR_CFG" --rules unbranded-type-consistency --files "$CR_FILE" --format json --no-error 2>/dev/null) \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(' '.join(str(l) for l in sorted(set(x['line'] for x in d.get('diagnostics',[])))))" 2>/dev/null | xargs)"
  if [ "$expected" = "$actual" ]; then
    pass=$((pass+1)); echo "PASS  config-resolve  [$expected]"
  else
    fail=$((fail+1)); failed="$failed config-resolve"
    echo "FAIL  config-resolve  | expected:[$expected]  actual:[$actual]"
  fi
fi

# options: prove `ruleOptions` changes a rule's behavior without copying the rule. The 8-line sample
# trips max-file-lines ONLY because the config sets ruleOptions.max-file-lines.maxLines = 5 (its
# default 300 would not). max-file-lines is opinionated (off by default) so the group is enabled.
OPT_CFG="$DIR/options-island.dlint.config.ts"
OPT_FILE="options-island/src/sample.ts"
if [ -f "$OPT_CFG" ] && { [ -z "$ONLY" ] || [ "$ONLY" = "options" ]; }; then
  expected="$(python3 -c '
import sys, re
exp = []
for i, line in enumerate(open(sys.argv[1]), 1):
    m = re.search(r"//\s*EXPECT:\s*[a-z][a-z0-9-]*(?:@(\d+))?", line)
    if m:
        exp.append(int(m.group(1)) if m.group(1) else i)
print(" ".join(str(x) for x in sorted(set(exp))))
' "$DIR/$OPT_FILE")"
  actual="$( (cd "$ROOT" && node "$CLI" --config "$OPT_CFG" --rules max-file-lines --files "$OPT_FILE" --format json --no-error 2>/dev/null) \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(' '.join(str(l) for l in sorted(set(x['line'] for x in d.get('diagnostics',[])))))" 2>/dev/null | xargs)"
  if [ "$expected" = "$actual" ]; then
    pass=$((pass+1)); echo "PASS  options  [$expected]"
  else
    fail=$((fail+1)); failed="$failed options"
    echo "FAIL  options  | expected:[$expected]  actual:[$actual]"
  fi
fi

# cli-robustness: an unexpected runtime error (here a malformed tsconfig) must surface as a friendly
# 'dlint:' message with a non-zero exit and NO Node stack trace - the top-level guard in cli.ts.
CLI_ISLAND="$DIR/cli-error-island"
if [ -d "$CLI_ISLAND" ] && { [ -z "$ONLY" ] || [ "$ONLY" = "cli-robustness" ]; }; then
  errfile="$(mktemp)"
  ( cd "$CLI_ISLAND" && node "$CLI" --config "$CLI_ISLAND/dlint.config.ts" --files src/x.ts --format compact ) >/dev/null 2>"$errfile"
  rc=$?
  if [ "$rc" -ne 0 ] && grep -q "^dlint:" "$errfile" && ! grep -qE "^[[:space:]]+at " "$errfile"; then
    pass=$((pass+1)); echo "PASS  cli-robustness  [friendly error, no stack]"
  else
    fail=$((fail+1)); failed="$failed cli-robustness"
    echo "FAIL  cli-robustness  | rc=$rc  err=$(head -1 "$errfile")"
  fi
  rm -f "$errfile"
fi
echo "────────────────────────"
echo "PASS: $pass   FAIL: $fail"
[ -n "$failed" ] && echo "failed:$failed"
[ "$fail" -eq 0 ]
