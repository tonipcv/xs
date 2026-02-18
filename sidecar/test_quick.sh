#!/bin/bash
cd /Users/albertalves/xaseai/xase-sheets/sidecar
echo "=== Building ==="
cargo build --tests 2>&1 | tail -20
echo ""
echo "=== Running pipeline_tests ==="
cargo test --test pipeline_tests 2>&1 | tail -50
