#!/usr/bin/env bash
# Швидка перевірка продуктивності продових маршрутів.
# Використання: BASE=https://tusivka.byndevav.workers.dev bash scripts/perf-check.sh
set -euo pipefail
BASE="${BASE:-https://tusivka.byndevav.workers.dev}"
EVENT_ID="${EVENT_ID:-4999f0f5-4586-4c5a-ac83-4389f8d9ba12}"

measure() {
  local label="$1" path="$2" limit="$3"
  local total
  local bust="cb=$(date +%s%N)"
  local sep='?'
  [[ "$path" == *'?'* ]] && sep='&'
  total=$(curl -s -o /dev/null -w '%{time_total}' --max-time 15 "${BASE}${path}${sep}${bust}")
  local ms
  ms=$(python3 -c "print(int(float('$total')*1000))")
  printf '%-8s %5d ms (limit %d)\n' "$label" "$ms" "$limit"
  python3 -c "exit(0 if $ms <= $limit else 1)" || {
    echo "FAIL: $label повільніше за ${limit} ms" >&2
    return 1
  }
}

measure home "/" 400
measure event "/events/${EVENT_ID}" 800
measure cover "/events/${EVENT_ID}/cover" 500
echo "PASS"
