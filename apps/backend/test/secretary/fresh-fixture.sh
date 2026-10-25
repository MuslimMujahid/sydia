#!/usr/bin/env bash
# Seeds one isolated QA fixture for a wording-sensitive case so earlier runs on
# a shared account cannot shape its reply. Prints the new manifest path.
# Usage (from repo root): apps/backend/test/secretary/fresh-fixture.sh
set -euo pipefail
cd "$(dirname "$0")/../../../.."
export NODE_ENV=development
export SECRETARY_QA_API="${SECRETARY_QA_API:-http://localhost:5001}"

out=$(timeout 300 bun run apps/backend/test/secretary/seed.ts --prepare-memory 2>&1)
manifest=$(printf '%s\n' "$out" | sed -n 's/.*Manifest: \(.*manifest\.json\).*/\1/p' | head -1)
if [ -z "$manifest" ] || ! printf '%s\n' "$out" | grep -q 'memory delivery admitted'; then
  printf '%s\n' "$out" | tail -5 >&2
  echo "fixture seed or memory admission failed" >&2
  exit 1
fi

run=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['runId'])" "$manifest")
prefix="secretary-qa-$run"

# Index the fixture notes now so retrieval does not depend on the recovery sweep.
cd apps/backend
cat > test/secretary/.index-fixture.tmp.ts <<'EOF'
import { Queue } from 'bullmq';
const [userId, ...ids] = process.argv.slice(2);
const queue = new Queue('daily-note-indexes', { connection: { url: process.env.BACKEND_REDIS_URL! } });
for (const itemId of ids)
  await queue.add('custom-index', { kind: 'custom-index', userId, itemId }, { jobId: `qa-index-${itemId}-${Date.now()}` });
await queue.close();
EOF
trap 'rm -f test/secretary/.index-fixture.tmp.ts' EXIT
bun --env-file=../../.env run test/secretary/.index-fixture.tmp.ts "$prefix-primary" \
  "$prefix-acme-note" "$prefix-supplier-note" "$prefix-resume-note" "$prefix-unsafe-note"

echo "$manifest"
