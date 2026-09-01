#!/usr/bin/env bash
# One shot: corpus in place, forms extracted, act ingested. Safe to re-run —
# the forms extractor is byte-identical on a second pass and ingestion upserts
# by a stable chunk id rather than appending.
set -euo pipefail

cd "$(dirname "$0")/.."

PDF="${SOURCE_PDF:-data/raw/bnss-2023.pdf}"
SOURCE_URI="${SOURCE_URI:-https://drive.google.com/uc?export=download&id=1mjs9lsMF0PtSsbQgz4-UcEHlyIvAzZ6o}"

say() { printf '\n=== %s\n' "$1"; }

say "corpus"
if [ -f "$PDF" ]; then
  echo "already here: $PDF ($(wc -c < "$PDF") bytes)"
else
  echo "fetching the bare act"
  mkdir -p "$(dirname "$PDF")"
  curl -fL --retry 5 --retry-delay 3 -o "$PDF" "$SOURCE_URI"
fi

# a wrong file here poisons everything downstream, so check it is a pdf at all
head -c 5 "$PDF" | grep -q '%PDF-' || { echo "not a pdf: $PDF" >&2; exit 1; }

say "waiting for the stack"
for dep in "${QDRANT_URL:-http://localhost:6333}/readyz" "${EMBEDDING_URL:-http://localhost:8081}/health"; do
  printf 'waiting for %s ' "$dep"
  for _ in $(seq 1 60); do
    if curl -fsS -m 2 "$dep" > /dev/null 2>&1; then break; fi
    printf '.'
    sleep 5
  done
  echo ' up'
done

say "forms"
if [ -f data/forms/forms_manifest.json ]; then
  echo "manifest present, skipping extraction (delete data/forms to redo it)"
else
  node backend/scripts/extract-forms.js
fi

say "ingest"
node backend/scripts/ingest.js "$PDF"

say "done"
echo "api      http://localhost:8000/api/v1/health"
echo "frontend http://localhost:5173"
