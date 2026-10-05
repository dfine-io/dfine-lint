#!/usr/bin/env bash
# dlint rule test harness — scalable TP/FP gate.
# Convention: each tests/fixtures/<rule>.fixture.ts(x) is linted with `--rules <rule>`.
#   Lines marked `// EXPECT: <rule>` MUST be flagged (true positives).
#   Every other line MUST NOT be flagged (negative near-misses → false-positive guard).
# Add a rule's coverage = drop a <rule>.fixture.ts(x) file. No harness edits needed.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
CLI="${DLINT_CLI:-$ROOT/build/cli.js}"
ONLY="${1:-}"

pass=0; fail=0; failed=""

# Lines a file marks with `// EXPECT: <rule>` (or `@<line>`), sorted; one entry per marker, so two
# findings on one line need two markers.
expected_lines() {
  python3 -c '
import sys, re
exp = []
for i, line in enumerate(open(sys.argv[1]), 1):
    for m in re.finditer(r"//\s*EXPECT:\s*[a-z][a-z0-9-]*(?:@(\d+))?", line):
        exp.append(int(m.group(1)) if m.group(1) else i)
print(" ".join(str(x) for x in sorted(exp)))
' "$1"
}

# Finding lines of a dlint JSON report on stdin, sorted; a line reported twice appears twice.
finding_lines() {
  python3 -c "import json,sys; d=json.load(sys.stdin); print(' '.join(str(l) for l in sorted(x['line'] for x in d.get('diagnostics',[]))))" 2>/dev/null | xargs
}

# verdict <name> <expected> <actual>: count and print one check.
verdict() {
  if [ "$2" = "$3" ]; then
    pass=$((pass+1)); echo "PASS  $1  [$2]"
  else
    fail=$((fail+1)); failed="$failed $1"
    echo "FAIL  $1  | expected:[$2]  actual:[$3]"
  fi
}

# island_check <name> <config> <file under tests/> <rule>: lint from ROOT through --config and compare
# the findings to the file's EXPECT markers.
island_check() {
  local actual
  actual="$( (cd "$ROOT" && node "$CLI" --config "$2" --rules "$4" --files "$3" --format json --no-error 2>/dev/null) | finding_lines)"
  verdict "$1" "$(expected_lines "$DIR/$3")" "$actual"
}

# fixtures/variants/ holds a rule's second fixture in the other extension: beside x.fixture.tsx, an
# x.fixture.ts in the same folder would push the .tsx out of the program
for fx in "$DIR"/fixtures/*.fixture.ts "$DIR"/fixtures/*.fixture.tsx "$DIR"/fixtures/variants/*.fixture.ts "$DIR"/fixtures/variants/*.fixture.tsx; do
  [ -e "$fx" ] || continue
  base="$(basename "$fx")"
  rule="${base%.fixture.ts}"; rule="${rule%.fixture.tsx}"
  [ -n "$ONLY" ] && [ "$ONLY" != "$rule" ] && continue
  actual="$(node "$CLI" --path "$DIR" --rules "$rule" --files "${fx#"$DIR"/}" --format json --no-error 2>/dev/null | finding_lines)"
  verdict "$rule" "$(expected_lines "$fx")" "$actual"
done

# banned-syntax: a delete on a global, parenthesized or not, is one no-delete-var finding, never a reassign
if [ -z "$ONLY" ] || [ "$ONLY" = "banned-syntax" ]; then
  bs_found="$(node "$CLI" --path "$DIR" --rules banned-syntax --files fixtures/banned-syntax.fixture.ts --format json --no-error 2>/dev/null \
    | python3 -c "
import json, sys
lines = [i for i, l in enumerate(open(sys.argv[1]), 1) if any(f'delete {d};' in l for d in ('NaN', '(NaN)', '((NaN))'))]
d = json.load(sys.stdin)['diagnostics']
print(' '.join(str(len([x for x in d if x['line'] == n and x['message'].startswith('Do not use delete')])) + '/' + str(len([x for x in d if x['line'] == n])) for n in lines))
" "$DIR/fixtures/banned-syntax.fixture.ts" 2>/dev/null)"
  verdict banned-syntax:delete-global-once "1/1 1/1 1/1" "$bs_found"
fi

# unused-export: an import() with an options argument still references every export of the module it loads
if [ -z "$ONLY" ] || [ "$ONLY" = "unused-export" ]; then
  ue_out="$(node "$CLI" --path "$DIR" --rules unused-export --files fixtures/unused-export.dynamic.ts --format json --no-error 2>/dev/null)"
  verdict unused-export:import-options "rc=0 []" "rc=$? [$(printf '%s' "$ue_out" | finding_lines)]"
fi

# route-boundary needs an app/<route>/ layout: the rule keys off path segments relative to the
# project root (--path), so its fixture lives in a dedicated island. It runs twice: from inside the
# island, and from the repo root with --path, where the working directory is not the project root.
RB_ISLAND="$DIR/route-boundary-island"
RB_FILE="app/dashboard/importer.ts"
if [ -f "$RB_ISLAND/$RB_FILE" ] && { [ -z "$ONLY" ] || [ "$ONLY" = "route-boundary" ]; }; then
  actual="$( (cd "$RB_ISLAND" && node "$CLI" --path . --rules route-boundary --files "$RB_FILE" --format json --no-error 2>/dev/null) | finding_lines)"
  verdict route-boundary "$(expected_lines "$RB_ISLAND/$RB_FILE")" "$actual"
  actual="$( (cd "$ROOT" && node "$CLI" --path "$RB_ISLAND" --rules route-boundary --files "$RB_FILE" --format json --no-error 2>/dev/null) | finding_lines)"
  verdict route-boundary:path "$(expected_lines "$RB_ISLAND/$RB_FILE")" "$actual"
fi

# Root constants/: a constants/ directory at the project root counts like a nested one, so its own
# constants are no no-local-constants finding (no-duplicated-constants reads it in its fixture).
if [ -z "$ONLY" ] || [ "$ONLY" = "no-local-constants" ]; then
  actual="$(node "$CLI" --path "$DIR" --rules no-local-constants --files constants/limits.ts --format json --no-error 2>/dev/null | finding_lines)"
  verdict no-local-constants:root-constants "" "$actual"
fi

# promise-all-opportunity names a dynamic import by its specifier; the type string held an absolute path
if [ -z "$ONLY" ] || [ "$ONLY" = "promise-all-opportunity" ]; then
  pa_msg="$(node "$CLI" --path "$DIR" --rules promise-all-opportunity --files fixtures/promise-all-opportunity.fixture.ts --format json --no-error 2>/dev/null \
    | python3 -c 'import json,sys; print(next((d["message"] for d in json.load(sys.stdin)["diagnostics"] if "import(" in d["message"]), "none"))' 2>/dev/null)"
  verdict promise-all-opportunity:import-message 'Sequential awaits could be Promise.all: import("./promise-all-opportunity.helper") + import("node:url")' "$pa_msg"
fi

# effect-cleanup walks each helper body once per cleanup: nine mutually calling helpers and a 20-step ladder of
# double calls stay fast, clean and alive (a crash exits 2 with no findings, so the exit code is checked too)
if [ -z "$ONLY" ] || [ "$ONLY" = "effect-cleanup" ]; then
  ec_start=$(date +%s)
  ec_json="$(node "$CLI" --path "$DIR" --rules effect-cleanup --files fixtures/effect-cleanup.graph.tsx --format json --no-error 2>/dev/null)"
  ec_rc=$?
  ec_secs=$(( $(date +%s) - ec_start ))
  verdict effect-cleanup:recursion-graph "rc=0 [] fast" "rc=$ec_rc [$(printf '%s' "$ec_json" | finding_lines)] $([ "$ec_secs" -lt 15 ] && echo fast || echo "slow ${ec_secs}s")"
fi

# severity-island: groups, overrides (sub-check, file-scoped) and include decide each finding's severity.
# Each src file holds a typescript:no-explicit-any finding (line 2), an untagged typescript finding (line 3) and a
# third statement; rules/sub/probe.ts reports untagged, "tagged" and isSubCheckDisabled-gated findings on lines 2-4.
# A temp copy is a git repo, since a full scan lists files through git; each case writes its own config. A case
# prints the sorted "file:line:col severity" pairs, OFF when the rule is off everywhere, or ERR on any other failure.
SV_ISLAND="$DIR/severity-island"
if [ -d "$SV_ISLAND" ] && { [ -z "$ONLY" ] || [ "$ONLY" = "severity" ]; }; then
  sv_root="$(mktemp -d)"; sv_tmp="$sv_root/project"
  mkdir -p "$sv_tmp" "$sv_root/outside" && cp -R "$SV_ISLAND/." "$sv_tmp"
  printf 'export const outside = (x: any) => x;\n' > "$sv_root/outside/c.ts"
  (cd "$sv_tmp" && git init -q && git add -A)
  sv_case() {
    local name="$1" cfg="$2" want="$3" rule="${4:-typescript}"; shift 4 2>/dev/null || shift $#
    printf 'export default { rulesDir: "rules", ...%s };\n' "$cfg" > "$sv_tmp/dlint.config.ts"
    local out err rc
    out="$(node "$CLI" --path "$sv_tmp" --rules "$rule" --format compact --no-error "$@" 2>"$sv_root/err")"; rc=$?
    err="$(cat "$sv_root/err")"
    case "$err" in *"turned off in config"*) out=OFF ;; *) [ "$rc" -ne 0 ] && out=ERR || out="$(printf '%s\n' "$out" | awk '/^src/ {print $1, $2}' | sort | xargs)" ;; esac
    verdict "severity:$name" "$want" "$out"
  }
  OP='{ id: "opinionated", severity: "error" }'
  B="src/b.ts"; A="src/only/a.ts"
  sv_case group-sub-check '{ groups: [{ id: "opinionated", severity: "warning" }] }' "$B:2:22 warning $B:3:33 error $A:2:22 warning $A:3:33 error"
  sv_case sub-check-override "{ groups: [$OP], overrides: [{ ruleId: \"typescript:no-explicit-any\", severity: \"warning\" }] }" "$B:2:22 warning $B:3:33 error $A:2:22 warning $A:3:33 error"
  sv_case rule-override-leaves-group-sub "{ groups: [$OP], overrides: [{ ruleId: \"typescript\", severity: \"warning\" }] }" "$B:2:22 error $B:3:33 warning $A:2:22 error $A:3:33 warning"
  sv_case rule-override-alone '{ overrides: [{ ruleId: "typescript", severity: "warning" }] }' "$B:3:33 warning $A:3:33 warning"
  sv_case last-override-wins '{ overrides: [{ ruleId: "typescript", severity: "error" }, { ruleId: "typescript", severity: "warning" }] }' "$B:3:33 warning $A:3:33 warning"
  sv_case only-sub-check-on '{ overrides: [{ ruleId: "typescript", severity: "off" }, { ruleId: "typescript:no-explicit-any", severity: "error" }] }' "$B:2:22 error $A:2:22 error"
  sv_case file-scoped-rule "{ groups: [$OP], overrides: [{ ruleId: \"typescript\", severity: \"warning\", files: [\"src/only/\"] }] }" "$B:2:22 error $B:3:33 error $A:2:22 error $A:3:33 warning"
  sv_case file-scoped-rule-off "{ groups: [$OP], overrides: [{ ruleId: \"typescript\", severity: \"off\", files: [\"src/only/\"] }] }" "$B:2:22 error $B:3:33 error"
  sv_case file-scoped-sub-check "{ groups: [$OP], overrides: [{ ruleId: \"typescript:no-explicit-any\", severity: \"off\", files: [\"src/only/\"] }] }" "$B:2:22 error $B:3:33 error $A:3:33 error"
  sv_case scoped-sub-beats-scoped-rule '{ overrides: [{ ruleId: "typescript", severity: "off", files: ["src/only/"] }, { ruleId: "typescript:no-explicit-any", severity: "warning", files: ["src/only/"] }] }' "$B:3:33 error $A:2:22 warning"
  sv_case global-sub-beats-rule-off '{ overrides: [{ ruleId: "typescript:no-explicit-any", severity: "warning" }, { ruleId: "typescript", severity: "off", files: ["src/only/"] }] }' "$B:2:22 warning $B:3:33 error $A:2:22 warning"
  sv_case file-scoped-enables '{ overrides: [{ ruleId: "typescript", severity: "off" }, { ruleId: "typescript", severity: "error", files: ["src/only/"] }] }' "$A:3:33 error"
  sv_case file-scoped-sub-enables '{ overrides: [{ ruleId: "typescript", severity: "off" }, { ruleId: "typescript:no-explicit-any", severity: "error", files: ["src/only/"] }] }' "$A:2:22 error"
  sv_case off-everywhere '{ overrides: [{ ruleId: "typescript", severity: "off" }] }' "OFF"
  sv_case off-everywhere-scoped '{ overrides: [{ ruleId: "typescript", severity: "off" }, { ruleId: "typescript", severity: "off", files: ["src/only/"] }] }' "OFF"
  sv_case empty-files-ignored '{ overrides: [{ ruleId: "typescript", severity: "off", files: [] }] }' "$B:3:33 error $A:3:33 error"
  sv_case include-glob "{ include: [\"src/only/**/*.ts\"], groups: [$OP] }" "$A:2:22 error $A:3:33 error"
  sv_case include-no-match '{ include: ["./src/**/*.ts"] }' "ERR"
  sv_case include-no-file-of-extension '{ include: ["src/**/*.tsx"] }' "ERR"
  sv_case files-dir-include "{ include: [\"src/only/**/*.ts\"], groups: [$OP] }" "$A:2:22 error $A:3:33 error" typescript --files src
  sv_case files-outside '{}' "" typescript --files ../outside
  sv_case probe-meta '{}' "$B:2:1 warning $B:3:1 warning $B:4:1 warning $A:2:1 warning $A:3:1 warning $A:4:1 warning" probe
  sv_case probe-override-beats-meta '{ overrides: [{ ruleId: "probe", severity: "error" }] }' "$B:2:1 error $B:3:1 error $B:4:1 error $A:2:1 error $A:3:1 error $A:4:1 error" probe
  sv_case probe-group-sub-beats-meta '{ groups: [{ id: "probe-group", severity: "error", rules: ["probe:tagged"] }] }' "$B:2:1 warning $B:3:1 error $B:4:1 warning $A:2:1 warning $A:3:1 error $A:4:1 warning" probe
  sv_case probe-gated-off '{ overrides: [{ ruleId: "probe:gated", severity: "off" }] }' "$B:2:1 warning $B:3:1 warning $A:2:1 warning $A:3:1 warning" probe
  sv_case probe-path-alias '{ overrides: [{ ruleId: "sub/probe", severity: "off" }] }' "OFF" probe
  rm -rf "$sv_root"
fi

# workspace-island: a workspace package linked into node_modules is project code, so the export
# app/main.ts imports through the link stays used. A temp copy gets the link, as a package manager would.
WS_ISLAND="$DIR/workspace-island"
if [ -d "$WS_ISLAND" ] && { [ -z "$ONLY" ] || [ "$ONLY" = "workspace" ]; }; then
  ws_tmp="$(mktemp -d)"
  cp -R "$WS_ISLAND/." "$ws_tmp"
  mkdir -p "$ws_tmp/node_modules/@ws"
  ln -sfn ../../packages/shared "$ws_tmp/node_modules/@ws/shared"
  # unused-export is opinionated: a throwaway config enables its group
  printf 'export default { groups: [{ id: "opinionated", severity: "error" }] };\n' > "$ws_tmp/dlint.config.ts"
  actual="$( (cd "$ws_tmp" && node "$CLI" --path . --rules unused-export --files packages/shared/index.ts --format json --no-error 2>/dev/null) | finding_lines)"
  verdict workspace:linked-package "$(expected_lines "$WS_ISLAND/packages/shared/index.ts")" "$actual"
  rm -rf "$ws_tmp"
fi

# config-resolve: prove `dlint --config <file>` resolves rulesDir + a SUBDIR tsconfig relative to
# the config's directory (not the cwd), so the same config runs from anywhere on anything. Runs from
# ROOT (cwd != config dir); without the dirname(tsconfig) basePath fix the program is empty → 0.
CR_CFG="$DIR/config-resolve-island.dlint.config.ts"
CR_FILE="config-resolve-island/src/sample.ts"
if [ -f "$CR_CFG" ] && { [ -z "$ONLY" ] || [ "$ONLY" = "config-resolve" ]; }; then
  island_check config-resolve "$CR_CFG" "$CR_FILE" unbranded-type-consistency
fi

# options: prove `ruleOptions` changes a rule's behavior without copying the rule. The 8-line sample
# trips max-file-lines ONLY because the config sets ruleOptions.max-file-lines.maxLines = 5 (its
# default 300 would not). max-file-lines is opinionated (off by default) so the group is enabled.
OPT_CFG="$DIR/options-island.dlint.config.ts"
OPT_FILE="options-island/src/sample.ts"
if [ -f "$OPT_CFG" ] && { [ -z "$ONLY" ] || [ "$ONLY" = "options" ]; }; then
  island_check options "$OPT_CFG" "$OPT_FILE" max-file-lines
  island_check options:cleanup-map-string "$OPT_CFG" "options-island/src/effect.ts" effect-cleanup
fi

# nodup: prove no-duplicate-schema-export's `ignorePaths` option. keep.ts exports Twin (also in
# keep2.ts -> real duplicate, fires) and Shared (also in ignored/mirror.ts, but ignorePaths drops
# that path -> silent). Only the Twin line carries an EXPECT marker.
NODUP_CFG="$DIR/nodup-island.dlint.config.ts"
NODUP_FILE="nodup-island/src/keep.ts"
if [ -f "$NODUP_CFG" ] && { [ -z "$ONLY" ] || [ "$ONLY" = "nodup" ]; }; then
  island_check nodup "$NODUP_CFG" "$NODUP_FILE" no-duplicate-schema-export
fi

# guard_case <name> <rc> <stderr patterns, one per line> <dir> [extra args]: run dlint from <dir> with its
# dlint.config.ts and check the exit code, every pattern, and that no Node stack trace leaked.
guard_case() {
  local name="$1" want="$2" patterns="$3" dir="$4" errfile rc p actual; shift 4
  errfile="$(mktemp)"
  ( cd "$dir" && node "$CLI" --config "$dir/dlint.config.ts" --files src/x.ts --format compact --no-error "$@" ) >/dev/null 2>"$errfile"
  rc=$?
  actual="rc=$rc"
  while IFS= read -r p; do grep -qE "$p" "$errfile" || actual="$actual missing:$p"; done <<< "$patterns"
  grep -qE "^[[:space:]]+at " "$errfile" && actual="$actual stack-trace"
  [ "$actual" = "rc=$want" ] || actual="$actual err=$(head -1 "$errfile")"
  verdict "$name" "rc=$want" "$actual"
  rm -f "$errfile"
}

# cli-robustness: a tsconfig that is not JSON at all must surface through the top-level guard in cli.ts
# as a friendly 'dlint:' message with exit 2 and NO Node stack trace.
CLI_ISLAND="$DIR/cli-error-island"
if [ -d "$CLI_ISLAND" ] && { [ -z "$ONLY" ] || [ "$ONLY" = "cli-robustness" ]; }; then
  guard_case cli-robustness 2 "^dlint:" "$CLI_ISLAND"
fi

# config-guard: a tsconfig that gives no reliable file set must stop the run with exit 2 and a friendly
# `dlint:` line, never lint silently. Only an error inside compilerOptions (e.g. an option only a newer
# TypeScript knows) warns and lints on. Each case picks a tsconfig in cli-error-island through
# DLINT_GUARD_TSCONFIG.
if [ -d "$CLI_ISLAND" ] && { [ -z "$ONLY" ] || [ "$ONLY" = "config-guard" ]; }; then
  DLINT_GUARD_TSCONFIG=comma.tsconfig.json guard_case config-guard:invalid-json 2 "^dlint:" "$CLI_ISLAND"
  DLINT_GUARD_TSCONFIG=child.tsconfig.json guard_case config-guard:broken-base 2 "^dlint:" "$CLI_ISLAND"
  DLINT_GUARD_TSCONFIG=empty.tsconfig.json guard_case config-guard:no-inputs 2 "^dlint:" "$CLI_ISLAND"
  DLINT_GUARD_TSCONFIG=solution.tsconfig.json guard_case config-guard:solution 2 "includes no files" "$CLI_ISLAND"
  # A located error outside compilerOptions (wrong type for include) is fatal even though its code is >= 2000
  DLINT_GUARD_TSCONFIG=include-type.tsconfig.json guard_case config-guard:non-option-error 2 "'include' requires a value of type" "$CLI_ISLAND"
  # tsconfig.typecheck.json exists only at the repo root: a parent-directory fallback would pick it up
  DLINT_GUARD_TSCONFIG=tsconfig.typecheck.json guard_case config-guard:no-parent-fallback 2 "not found or unreadable" "$CLI_ISLAND"
  DLINT_GUARD_TSCONFIG=option.tsconfig.json guard_case config-guard:option-warns 0 "Unknown compiler option" "$CLI_ISLAND"
  guard_case config-guard:rules-off-and-unknown 2 $'turned off in config: max-file-lines\nUnknown rule\\(s\\): no-such-rule' \
    "$CLI_ISLAND" --rules max-file-lines --rules no-such-rule
  # A --config that points nowhere and a missing --files entry are usage errors, never a silent lint
  guard_case config-guard:missing-config 2 "config not found" "$CLI_ISLAND" --config "$CLI_ISLAND/missing.dlint.config.ts"
  DLINT_GUARD_TSCONFIG=option.tsconfig.json guard_case config-guard:missing-files 2 "not found \(a file or directory" "$CLI_ISLAND" --files src/nope.ts
  # A node_modules that is a file blocks the cache dir: the cache is optional, the lint still runs
  guard_tmp="$(mktemp -d)"
  cp -R "$CLI_ISLAND/." "$guard_tmp" && rm -rf "$guard_tmp/node_modules" && touch "$guard_tmp/node_modules"
  DLINT_GUARD_TSCONFIG=option.tsconfig.json guard_case config-guard:cache-blocked 0 "Unknown compiler option" "$guard_tmp"
  chmod 000 "$guard_tmp/option.tsconfig.json"
  DLINT_GUARD_TSCONFIG=option.tsconfig.json guard_case config-guard:unreadable 2 "not found or unreadable" "$guard_tmp"
  chmod 644 "$guard_tmp/option.tsconfig.json"; rm -rf "$guard_tmp"
fi

# ts7-alias: prove dlint's jiti alias pins its bundled TS6 engine for CONSUMER rules even when the
# consumer project ships a TS7-native `typescript` with no in-process JS-API. Stage the stub into a
# real node_modules (as an npm install would), then lint: the consumer rule imports bare `typescript`
# and calls ts.isDebuggerStatement — it only fires if the alias resolved dlint's 6.x. Without the
# alias the bare import resolves the API-less stub and the rule crashes → no finding (regression guard).
TS7_ISLAND="$DIR/ts7-consumer-island"
TS7_CFG="$DIR/ts7-consumer-island.dlint.config.ts"
TS7_FILE="ts7-consumer-island/src/sample.ts"
if [ -d "$TS7_ISLAND" ] && { [ -z "$ONLY" ] || [ "$ONLY" = "ts7-alias" ]; }; then
  mkdir -p "$TS7_ISLAND/node_modules"
  rm -rf "$TS7_ISLAND/node_modules/typescript"
  cp -r "$TS7_ISLAND/stub-typescript" "$TS7_ISLAND/node_modules/typescript"
  island_check ts7-alias "$TS7_CFG" "$TS7_FILE" ts7-engine-probe
  rm -rf "$TS7_ISLAND/node_modules"
fi

# sdk-contract: a consumer probe rule reports where SDK helpers answer yes (isInConditionalBranch,
# isLibDeclaration, isFromPackage), pinning contracts no bundled rule exercises. A second run checks
# --extract on an exported arrow function: function-tags must not crash and must read its return type,
# complexity-analysis must count the arrow's own parameter and no helper function, and function-consumption
# must list imported project functions (a default export by its own name) under their file and leave axios out.
SDK_CFG="$DIR/sdk-contract-island.dlint.config.ts"
if [ -f "$SDK_CFG" ] && { [ -z "$ONLY" ] || [ "$ONLY" = "sdk-contract" ]; }; then
  island_check sdk-contract "$SDK_CFG" "sdk-contract-island/src/sample.ts" sdk-contract-probe
  ex_verdict="$( (cd "$ROOT" && node "$CLI" --config "$SDK_CFG" --extract --files sdk-contract-island/src/actions.ts 2>/dev/null) | python3 -c '
import json, sys
try:
    ex = json.load(sys.stdin)["extractors"]
except Exception:
    print("no-json"); sys.exit()
tag = next((t for t in ex["function-tags"]["items"] if t["functionName"] == "act"), None)
cx = next((c for c in ex["complexity-analysis"]["items"] if c["functionName"] == "act"), None)
if not tag or tag["returnType"] != "string":
    print("tags:%s" % tag); sys.exit()
if not cx or cx["parameterCount"] != 1 or cx["helperFunctionCount"] != 0:
    print("complexity:%s" % cx); sys.exit()
fc = next((c for c in ex["function-consumption"]["items"] if c["name"] == "act"), None)
targets = sorted((t["name"], t["file"].rsplit("/", 1)[-1]) for t in (fc or {}).get("callTargets", []))
if targets != [("formatAmount", "format.ts"), ("probe", "actions.ts"), ("roundAmount", "format.ts")]:
    print("consumption:%s" % targets); sys.exit()
print("ok")
' 2>/dev/null)"
  verdict sdk-contract:extract ok "$ex_verdict"
fi
# list-rules: `dlint --list-rules` emits the loaded rule set as JSON (id + description) before any
# file scan or Program build. Five real runs, one verdict: (1) tests/dlint.config.ts enables the
# opinionated group, so every bundled rule passes the contract check (parseable, non-empty, exactly
# the two keys, no empty field, no description over 120 chars); (2) cli-error-island's tsconfig is
# malformed, so rc 0 proves no Program was built; (3) ts7-consumer-island sets bundledRules: false,
# so the inventory is exactly its one consumer rule, which proves the rulesDir merge; (4) the
# bad-length island must come back as too-long, proving the length check is not dead; (5) the
# no-desc island must still exit 0 with an empty inventory and report the reason on stderr, proving
# a malformed project rule is skipped and named instead of taking the whole run down.
if [ -z "$ONLY" ] || [ "$ONLY" = "list-rules" ]; then
  LR_CHECK='
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("invalid-json"); sys.exit()
if not isinstance(d, list) or not d:
    print("empty"); sys.exit()
for r in d:
    if sorted(r.keys()) != ["description", "id"]:
        print("bad-keys:" + str(sorted(r.keys()))); sys.exit()
    if not r["id"] or not r["description"]:
        print("empty-field:" + str(r.get("id"))); sys.exit()
    if len(r["description"]) > 120:
        print("too-long:%s=%d" % (r["id"], len(r["description"]))); sys.exit()
print("ok:%d" % len(d))
'
  lr_out="$( (cd "$ROOT" && node "$CLI" --config "$DIR/dlint.config.ts" --list-rules 2>/dev/null) )"
  lr_rc=$?
  lr_verdict="$(printf '%s' "$lr_out" | python3 -c "$LR_CHECK" 2>/dev/null)"
  ( cd "$CLI_ISLAND" && node "$CLI" --config "$CLI_ISLAND/dlint.config.ts" --list-rules ) >/dev/null 2>&1
  lr_island_rc=$?
  lr_ids="$( (cd "$ROOT" && node "$CLI" --config "$TS7_CFG" --list-rules 2>/dev/null) \
    | python3 -c "import json,sys; print(','.join(r['id'] for r in json.load(sys.stdin)))" 2>/dev/null)"
  lr_long="$( (cd "$ROOT" && node "$CLI" --config "$DIR/list-rules-length.dlint.config.ts" --list-rules 2>/dev/null) \
    | python3 -c "$LR_CHECK" 2>/dev/null)"
  lr_errfile="$(mktemp)"
  lr_nodesc_out="$( (cd "$ROOT" && node "$CLI" --config "$DIR/list-rules-nodesc.dlint.config.ts" --list-rules 2>"$lr_errfile") )"
  lr_nodesc_rc=$?
  lr_nodesc_err="$(cat "$lr_errfile")"; rm -f "$lr_errfile"
  if [ "$lr_rc" -ne 0 ]; then lr_verdict="rc=$lr_rc"; fi
  if [ "$lr_island_rc" -ne 0 ]; then lr_verdict="no-program:rc=$lr_island_rc"; fi
  if [ "$lr_ids" != "ts7-engine-probe" ]; then lr_verdict="rulesdir:ids=$lr_ids"; fi
  case "$lr_long" in too-long:*) ;; *) lr_verdict="length-branch-dead:$lr_long" ;; esac
  if [ "$lr_nodesc_rc" -ne 0 ]; then lr_verdict="nodesc-fatal:rc=$lr_nodesc_rc"; fi
  if [ "$lr_nodesc_out" != "[]" ]; then lr_verdict="nodesc-leaked:$lr_nodesc_out"; fi
  case "$lr_nodesc_err" in *"missing meta.description"*) ;; *) lr_verdict="nodesc-unreported" ;; esac
  case "$lr_verdict" in
    ok:*) pass=$((pass+1)); echo "PASS  list-rules  [$lr_verdict]" ;;
    *) fail=$((fail+1)); failed="$failed list-rules"; echo "FAIL  list-rules  | $lr_verdict" ;;
  esac
fi
# rules-tsconfig: dlint ships tsconfig.rules.json so a project rule pack can type-check its rules
# (jiti strips types at runtime, so an unchecked rule fails silently). The regression this guards is
# itself silent: without the exports subpath, `extends` fails with TS6053 and tsc then reports an
# unresolvable 'typescript' instead, which reads like a paths bug. Asserts the file ships, parses,
# carries both path mappings (typescript: dlint's nested copy under npm first, the pnpm sibling second),
# and is reachable through BOTH files and exports.
if [ -z "$ONLY" ] || [ "$ONLY" = "rules-tsconfig" ]; then
  rt_verdict="$( (cd "$ROOT" && python3 -c '
import json, re, sys
def load(p):
    return json.loads(re.sub(r"^\s*//.*$", "", open(p).read(), flags=re.M))
try:
    t = load("tsconfig.rules.json")
except Exception as e:
    print("unreadable:%s" % e); sys.exit()
paths = t.get("compilerOptions", {}).get("paths", {})
if paths.get("typescript") != ["./node_modules/typescript", "../../typescript"]:
    print("bad-ts-path:%s" % paths.get("typescript")); sys.exit()
if paths.get("@dfine-io-gmbh/dlint") != ["./build/index.d.ts"]:
    print("bad-dlint-path:%s" % paths.get("@dfine-io-gmbh/dlint")); sys.exit()
pkg = json.load(open("package.json"))
if "tsconfig.rules.json" not in pkg.get("files", []):
    print("not-in-files"); sys.exit()
if pkg.get("exports", {}).get("./tsconfig.rules.json") != "./tsconfig.rules.json":
    print("not-in-exports"); sys.exit()
print("ok")
') 2>/dev/null)"
  if [ "$rt_verdict" = "ok" ]; then
    pass=$((pass+1)); echo "PASS  rules-tsconfig  [shipped + reachable]"
  else
    fail=$((fail+1)); failed="$failed rules-tsconfig"; echo "FAIL  rules-tsconfig  | $rt_verdict"
  fi
fi
# use-server-island: unnecessary-use-server follows a barrel re-export to the client file, so actions.ts
# keeps its directive (no finding); orphan.ts has no client caller and must fire, which proves the run is live.
US_CFG="$DIR/use-server-island.dlint.config.ts"
if [ -f "$US_CFG" ] && { [ -z "$ONLY" ] || [ "$ONLY" = "use-server-island" ]; }; then
  island_check use-server-island:barrel "$US_CFG" "use-server-island/src/actions.ts" unnecessary-use-server
  island_check use-server-island:orphan "$US_CFG" "use-server-island/src/orphan.ts" unnecessary-use-server
fi

# rule-loading: every bundled rule loads (no "skipped rule", one id per rule file), and a consumer rule
# exported through module.exports still loads, because project rules keep jiti's interop.
if [ -z "$ONLY" ] || [ "$ONLY" = "rule-loading" ]; then
  rl_err="$(mktemp)"
  rl_count="$( (cd "$ROOT" && node "$CLI" --path tests --list-rules 2>"$rl_err") | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null)"
  rl_files="$(find "$ROOT/dlint-rules/universal" -name '*.ts' ! -name '*.d.ts' | wc -l | tr -d ' ')"
  rl_v="count=$rl_count"; grep -q "skipped rule" "$rl_err" && rl_v="$rl_v skipped"
  rl_cjs="$( (cd "$ROOT" && node "$CLI" --config "$SDK_CFG" --list-rules 2>"$rl_err") \
    | python3 -c "import json,sys; print(any(r['id'] == 'cjs-export-probe' for r in json.load(sys.stdin)))" 2>/dev/null)"
  [ "$rl_cjs" = "True" ] || rl_v="$rl_v cjs-missing"
  grep -q "skipped rule" "$rl_err" && rl_v="$rl_v cjs-skipped"
  verdict rule-loading "count=$rl_files" "$rl_v"
  rm -f "$rl_err"
fi

# git-guard: git modes run in temporary repositories with no config (bundled defaults, no-debug-code only;
# every file holds a debugger). A failed git call stops the run with exit 2: no repository, an unfetched
# base, a base git would read as a range or an option, a shallow --commit. An unborn HEAD, a root commit, a
# subdirectory project and file names with quotes or umlauts lint exactly their files; maxFileSize drops an
# oversized file from the full scan, --changed, --commit and --branch alike, and never from --files.
if [ -z "$ONLY" ] || [ "$ONLY" = "git-guard" ]; then
  gg="$(mktemp -d)"
  gitq() { git -C "$1" -c user.email=t@t -c user.name=t "${@:2}" >/dev/null 2>&1; }
  # files_of <dir> [args]: the sorted files a run reports, or rc=<n> when it fails
  files_of() {
    local dir="$1" out rc; shift
    out="$(cd "$dir" && node "$CLI" --format json --no-error --rules no-debug-code "$@" 2>/dev/null)"; rc=$?
    [ "$rc" -eq 0 ] || { echo "rc=$rc"; return; }
    printf '%s' "$out" | PYTHONIOENCODING=utf-8 python3 -c "import json,sys; print(' '.join(sorted({d['file'] for d in json.load(sys.stdin)['diagnostics']})))"
  }
  # git_fail <name> <stderr text> <dir> [args]: the run must exit 2 and say why
  git_fail() {
    local name="$1" why="$2" dir="$3" err rc; shift 3
    err="$(cd "$dir" && node "$CLI" --format json --rules no-debug-code "$@" 2>&1 >/dev/null)"; rc=$?
    case "$err" in *"$why"*) verdict "$name" "rc=2" "rc=$rc" ;; *) verdict "$name" "rc=2" "rc=$rc missing:$why" ;; esac
  }
  gg_ts='{"compilerOptions":{"strict":true,"noEmit":true,"types":[]},"include":["**/*.ts"]}'
  mkdir -p "$gg/repo/sub" "$gg/norepo"
  printf '%s' "$gg_ts" > "$gg/repo/tsconfig.json"
  for f in a.ts 'q"b.ts' 'ümlaut.ts'; do printf 'export function f(): void {\n  debugger;\n}\n' > "$gg/repo/$f"; done
  gitq "$gg/repo" init -q
  gitq "$gg/repo" add -A
  verdict git-guard:unborn-changed 'a.ts q"b.ts ümlaut.ts' "$(files_of "$gg/repo" --changed)"
  gitq "$gg/repo" commit -qm root
  verdict git-guard:root-commit 'a.ts q"b.ts ümlaut.ts' "$(files_of "$gg/repo" --commit)"
  printf '%s' "$gg_ts" > "$gg/repo/sub/tsconfig.json"
  printf 'export function s(): void {\n  debugger;\n}\n' > "$gg/repo/sub/s.ts"
  gitq "$gg/repo" add -A
  gitq "$gg/repo" commit -qm sub
  printf '// changed\n' >> "$gg/repo/sub/s.ts"
  verdict git-guard:subdir-changed "s.ts" "$(files_of "$gg/repo/sub" --changed)"
  printf 'export default { maxFileSize: 10 };\n' > "$gg/small.dlint.config.ts"
  verdict git-guard:max-file-size "" "$(files_of "$gg/repo/sub" --changed --config "$gg/small.dlint.config.ts" --path "$gg/repo/sub")"
  verdict git-guard:max-file-size-commit "" "$(files_of "$gg/repo/sub" --commit --config "$gg/small.dlint.config.ts" --path "$gg/repo/sub")"
  verdict git-guard:full-scan "s.ts" "$(files_of "$gg/repo/sub")"
  verdict git-guard:max-file-size-full "" "$(files_of "$gg/repo/sub" --config "$gg/small.dlint.config.ts" --path "$gg/repo/sub")"
  verdict git-guard:max-file-size-files "sub/s.ts" "$(files_of "$gg/repo" --files sub --config "$gg/small.dlint.config.ts" --path "$gg/repo")"
  verdict git-guard:max-file-size-file "sub/s.ts" "$(files_of "$gg/repo" --files sub/s.ts --config "$gg/small.dlint.config.ts" --path "$gg/repo")"
  gitq "$gg/repo" branch base HEAD~1
  printf 'export default { baseBranch: "base" };\n' > "$gg/local.dlint.config.ts"
  printf 'export default { baseBranch: "base", maxFileSize: 10 };\n' > "$gg/local-small.dlint.config.ts"
  verdict git-guard:local-branch "s.ts" "$(files_of "$gg/repo/sub" --branch --config "$gg/local.dlint.config.ts" --path "$gg/repo/sub")"
  verdict git-guard:max-file-size-branch "" "$(files_of "$gg/repo/sub" --branch --config "$gg/local-small.dlint.config.ts" --path "$gg/repo/sub")"
  git_fail git-guard:unknown-base "base branch origin/main not found" "$gg/repo" --branch
  printf 'export default { baseBranch: "main..HEAD" };\n' > "$gg/range.dlint.config.ts"
  git_fail git-guard:range-base "Invalid base branch" "$gg/repo" --branch --config "$gg/range.dlint.config.ts" --path "$gg/repo"
  printf 'export default { baseBranch: "-x" };\n' > "$gg/dash.dlint.config.ts"
  git_fail git-guard:dash-base "Invalid base branch" "$gg/repo" --branch --config "$gg/dash.dlint.config.ts" --path "$gg/repo"
  git clone -q --depth 1 "file://$gg/repo" "$gg/shallow" >/dev/null 2>&1
  git_fail git-guard:shallow-commit "this clone is shallow" "$gg/shallow" --commit
  printf '%s' "$gg_ts" > "$gg/norepo/tsconfig.json"
  printf 'export function n(): void {\n  debugger;\n}\n' > "$gg/norepo/n.ts"
  git_fail git-guard:no-repo "git ls-files" "$gg/norepo"
  rm -rf "$gg"
fi

# fix-island: --fix on copies of the island inputs, without a config and outside git (--files). html on the
# unfixed copy exits 1; --fix --benchmark --format json keeps stdout valid JSON with per-rule timings, writes
# each copy to its .expected.ts, keeps a byte order mark, never writes through a symlink that leads out of
# the copy, and exits with what is left. fix-overlap-probe pins that a fix lands whole or not at all and that
# an insert keeps the leading trivia, an ES2021 lib gets no Object.hasOwn suggestion, and under
# verbatimModuleSyntax a type-only specifier keeps an import or export-from in the cycle graph.
if [ -z "$ONLY" ] || [ "$ONLY" = "fix-island" ]; then
  fi_tmp="$(mktemp -d)"; fi_out="$(mktemp -d)"
  mkdir -p "$fi_tmp/src"
  cp "$DIR/fix-island/tsconfig.json" "$fi_tmp/"
  cp "$DIR/fix-island/src/util.ts" "$fi_tmp/src/"
  for n in fix bom overlap merge; do cp "$DIR/fix-island/src/$n.input.ts" "$fi_tmp/src/$n.ts"; done
  printf 'export function outside(): void {\n  debugger;\n}\n' > "$fi_out/outside.ts"
  cp "$fi_out/outside.ts" "$fi_out/outside.orig"
  ln -s "$fi_out/outside.ts" "$fi_tmp/src/link.ts"
  (cd "$fi_tmp" && node "$CLI" --format html --benchmark --files src/fix.ts) >/dev/null 2>"$fi_out/html.err"
  fi_v="rc=$?"; grep -q "running the bundled defaults" "$fi_out/html.err" || fi_v="$fi_v no-defaults-note"
  grep -q "^dlint timing: total" "$fi_out/html.err" || fi_v="$fi_v no-timing-on-stderr"
  verdict fix-island:html-exit "rc=1" "$fi_v"
  (cd "$fi_tmp" && node "$CLI" --fix --benchmark --format json --files src/fix.ts src/bom.ts src/link.ts) >"$fi_out/fix.json" 2>"$fi_out/fix.err"
  fi_v="rc=$? $(python3 -c '
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print("invalid-json"); sys.exit()
t = d.get("timings") or {}
if not t.get("rules") or "types" not in t.get("phases", {}):
    print("no-timings"); sys.exit()
# The report is the re-lint after fixing: both debugger statements in fix.ts are gone from it
if any(x["file"] == "src/fix.ts" and x["rule"] == "no-debug-code" for x in d["diagnostics"]):
    print("pre-fix-report"); sys.exit()
print("link-linted" if any(x["file"] == "src/link.ts" for x in d["diagnostics"]) else "link-not-linted")
' "$fi_out/fix.json")"
  for n in fix bom; do cmp -s "$fi_tmp/src/$n.ts" "$DIR/fix-island/src/$n.expected.ts" || fi_v="$fi_v $n-differs"; done
  cmp -s "$fi_out/outside.ts" "$fi_out/outside.orig" || fi_v="$fi_v wrote-through-symlink"
  grep -q "resolves outside the project" "$fi_out/fix.err" || fi_v="$fi_v no-symlink-note"
  verdict fix-island:fix "rc=1 link-linted" "$fi_v"
  printf 'export default { groups: [{ id: "opinionated", severity: "error" }] };\n' > "$fi_tmp/dlint.config.ts"
  (cd "$fi_tmp" && node "$CLI" --fix --rules duplicate-import self-import simplification --format json --files src/merge.ts) >/dev/null 2>&1
  verdict fix-island:merge "same" "$(cmp -s "$fi_tmp/src/merge.ts" "$DIR/fix-island/src/merge.expected.ts" && echo same || echo differs)"
  printf 'export default { bundledRules: false, rulesDir: "%s" };\n' "$DIR/sdk-contract-island/consumer-rules" > "$fi_tmp/dlint.config.ts"
  (cd "$fi_tmp" && node "$CLI" --fix --rules fix-overlap-probe --format json --files src/overlap.ts) >/dev/null 2>&1
  verdict fix-island:overlap "same" "$(cmp -s "$fi_tmp/src/overlap.ts" "$DIR/fix-island/src/overlap.expected.ts" && echo same || echo differs)"
  mkdir -p "$fi_tmp/es2021/src"
  printf '{"compilerOptions":{"strict":true,"noEmit":true,"lib":["ES2021"],"types":[]},"include":["src/**/*.ts"]}' > "$fi_tmp/es2021/tsconfig.json"
  printf 'export const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);\n' > "$fi_tmp/es2021/src/has.ts"
  fi_has="$(cd "$fi_tmp/es2021" && node "$CLI" --rules prefer-modern-api --format json --no-error --files src/has.ts 2>/dev/null)"
  verdict fix-island:hasown-es2021 "rc=0 []" "rc=$? [$(printf '%s' "$fi_has" | finding_lines)]"
  # Under verbatimModuleSyntax `import { type B }` stays a runtime import, so a.ts and b.ts form a cycle
  mkdir -p "$fi_tmp/vms"
  printf '{"compilerOptions":{"strict":true,"noEmit":true,"verbatimModuleSyntax":true,"module":"ESNext","moduleResolution":"bundler","types":[]},"include":["*.ts"]}' > "$fi_tmp/vms/tsconfig.json"
  printf 'import { type B } from "./b";\nexport const a = 1;\nexport type A = B;\n' > "$fi_tmp/vms/a.ts"
  printf 'import { a } from "./a";\nexport type B = number;\nexport const b = a;\n' > "$fi_tmp/vms/b.ts"
  fi_vms="$(cd "$fi_tmp/vms" && node "$CLI" --rules no-import-cycle --format json --no-error --files a.ts 2>/dev/null)"
  verdict fix-island:vms-cycle "rc=0 [1]" "rc=$? [$(printf '%s' "$fi_vms" | finding_lines)]"
  printf 'export { type D } from "./d";\nexport const c = 1;\n' > "$fi_tmp/vms/c.ts"
  printf 'import { c } from "./c";\nexport type D = number;\nexport const d = c;\n' > "$fi_tmp/vms/d.ts"
  fi_vms="$(cd "$fi_tmp/vms" && node "$CLI" --rules no-import-cycle --format json --no-error --files c.ts 2>/dev/null)"
  verdict fix-island:vms-export-cycle "rc=0 [1]" "rc=$? [$(printf '%s' "$fi_vms" | finding_lines)]"
  # A project rule resolves the SDK from its own folder: an older install there must not replace the running engine's
  fi_stale="$fi_tmp/stale"
  mkdir -p "$fi_stale/src" "$fi_stale/rules" "$fi_stale/node_modules/@dfine-io-gmbh/dlint"
  printf '{"name":"@dfine-io-gmbh/dlint","type":"module","main":"index.js"}' > "$fi_stale/node_modules/@dfine-io-gmbh/dlint/package.json"
  printf 'export const defineRule = (rule) => rule;\nexport const isLibDeclaration = () => false;\n' > "$fi_stale/node_modules/@dfine-io-gmbh/dlint/index.js"
  cat > "$fi_stale/rules/lib-probe.ts" <<'PROBE'
import ts from "typescript";
import { defineRule, isLibDeclaration } from "@dfine-io-gmbh/dlint";
export default defineRule({
  meta: { category: "quality", description: "Test probe: reports Promise when the SDK sees a lib symbol" },
  check(ctx) {
    ctx.walk((node) => {
      const sym = ts.isIdentifier(node) && node.text === "Promise" ? ctx.checker.getSymbolAtLocation(node) : undefined;
      if (sym && isLibDeclaration(sym)) ctx.reportAt(node, "Promise is a lib symbol");
    });
  },
});
PROBE
  printf '{"compilerOptions":{"strict":true,"noEmit":true,"lib":["ES2020"],"types":[]},"include":["src/**/*.ts"]}' > "$fi_stale/tsconfig.json"
  printf 'export default { bundledRules: false, rulesDir: "%s" };\n' "$fi_stale/rules" > "$fi_stale/dlint.config.ts"
  printf 'export const settled = Promise.resolve(1);\n' > "$fi_stale/src/a.ts"
  fi_sdk="$(cd "$fi_stale" && node "$CLI" --rules lib-probe --format json --no-error --files src/a.ts 2>/dev/null)"
  verdict fix-island:stale-sdk "rc=0 [1]" "rc=$? [$(printf '%s' "$fi_sdk" | finding_lines)]"
  # --files takes ./ paths and paths outside the project; a named file the ignore rules exclude is skipped with a note
  fi_ign="$fi_tmp/ignored"
  mkdir -p "$fi_ign/src" "$fi_tmp/outside"
  printf '{"compilerOptions":{"strict":true,"noEmit":true,"types":[]},"include":["src/**/*.ts"]}' > "$fi_ign/tsconfig.json"
  printf 'debugger;\nexport const a = 1;\n' > "$fi_ign/src/a.ts"
  printf 'debugger;\nexport const b = 1;\n' > "$fi_ign/src/b.ts"
  printf 'export const outside = 1;\n' > "$fi_tmp/outside/o.ts"
  printf 'src/b.ts\n' > "$fi_ign/.dlintignore"
  printf 'export default {};\n' > "$fi_ign/dlint.config.ts"
  fi_files="$(cd "$fi_ign" && node "$CLI" --rules no-debug-code --format json --no-error --files ./src/a.ts src/b.ts ../outside/o.ts 2>"$fi_out/ign.err")"
  fi_v="rc=$? [$(printf '%s' "$fi_files" | finding_lines)]"
  grep -q 'skipped src/b.ts, it matches "src/b.ts" in .dlintignore' "$fi_out/ign.err" && fi_v="$fi_v noted"
  verdict fix-island:files-ignore "rc=0 [1] noted" "$fi_v"
  rm -rf "$fi_tmp" "$fi_out"
fi

echo "────────────────────────"
echo "PASS: $pass   FAIL: $fail"
[ -n "$failed" ] && echo "failed:$failed"
[ "$fail" -eq 0 ]
