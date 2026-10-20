#!/bin/bash
FAILS=0
while true; do
  [ -f STOP ] && echo "STOP file found — halting." && break
  if claude -p "Read CLAUDE.md and execute exactly ONE cycle, then exit." \
       --dangerously-skip-permissions >> CYCLES.log 2>&1; then
    FAILS=0
  else
    FAILS=$((FAILS+1))
  fi
  [ "$FAILS" -ge 3 ] && echo "3 consecutive failures — halting." && break
  sleep 5
done
