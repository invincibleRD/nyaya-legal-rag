#!/bin/bash
# pull the embedding weights once, for when tei's own download is too slow to
# survive a flaky link. resumable.
set -e
DIR="${1:-./data/models/bge-base-en-v1.5}"
BASE=https://huggingface.co/BAAI/bge-base-en-v1.5/resolve/main
mkdir -p "$DIR/onnx" "$DIR/1_Pooling"

for f in config.json tokenizer.json tokenizer_config.json special_tokens_map.json vocab.txt \
         config_sentence_transformers.json 1_Pooling/config.json onnx/model.onnx; do
  curl -fL -C - --retry 10 --retry-delay 5 -o "$DIR/$f" "$BASE/$f"
  echo "got $f"
done
