#!/usr/bin/env bash
# Creates the "lodesong" GitHub Project board, adds every roadmap issue to it and sets Phase + Priority.
# Needs gh with the project scope:  gh auth refresh -s project
# Usage: scripts/setup-project.sh [owner] [repo]
set -euo pipefail

OWNER="${1:-FindMalek}"
REPO="${2:-lodesong}"
TITLE="lodesong"

# issue -> phase (see docs/ROADMAP.md); epics go in phase 0.
declare -A PHASE=(
  [1]=0 [2]=0 [3]=0 [4]=0 [5]=0 [6]=0 [7]=0 [8]=0 [9]=0 [10]=0 [30]=0 [60]=0
  [11]=1 [12]=1 [13]=1 [14]=1 [15]=1 [16]=1 [17]=1 [18]=1 [19]=1 [20]=1 [54]=1
  [21]=2 [22]=2 [25]=2 [47]=2 [26]=2 [27]=2 [28]=2 [29]=2
  [34]=3 [35]=3 [31]=3 [32]=3 [33]=3
  [37]=4 [38]=4 [39]=4 [40]=4 [41]=4 [42]=4 [43]=4 [44]=4 [45]=4 [46]=4
  [50]=5 [51]=5 [52]=5 [53]=5 [36]=5 [48]=5 [49]=5
  [23]=6 [24]=6 [55]=6 [56]=6 [57]=6 [58]=6 [59]=6 [61]=6 [62]=6 [63]=6 [64]=6 [65]=6
)
PHASE_NAMES=("0 · epics" "1 · foundation & speed" "2 · playback & keyboard" "3 · lyrics & search" "4 · polish & sync" "5 · v1.0 release" "6 · beyond")

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

number=$(gh project list --owner "$OWNER" --format json | jq -r --arg t "$TITLE" '.projects[] | select(.title == $t) | .number' | head -1)
if [[ -z "$number" ]]; then
  number=$(gh project create --owner "$OWNER" --title "$TITLE" --format json | jq -r .number)
  echo "created project #$number"
fi
project_id=$(gh project view "$number" --owner "$OWNER" --format json | jq -r .id)
gh project link "$number" --owner "$OWNER" --repo "$OWNER/$REPO" >/dev/null 2>&1 || true

fields() { gh project field-list "$number" --owner "$OWNER" --format json; }
ensure_field() {
  local name=$1 options=$2
  if ! fields | jq -e --arg n "$name" '.fields[] | select(.name == $n)' >/dev/null; then
    gh project field-create "$number" --owner "$OWNER" --name "$name" --data-type SINGLE_SELECT --single-select-options "$options" >/dev/null
  fi
}
ensure_field Phase "$(IFS=,; echo "${PHASE_NAMES[*]}")"
ensure_field Priority "p0,p1,p2"

all_fields=$(fields)
field_id() { jq -r --arg n "$1" '.fields[] | select(.name == $n) | .id' <<<"$all_fields"; }
option_id() { jq -r --arg n "$1" --arg o "$2" '.fields[] | select(.name == $n) | .options[] | select(.name == $o) | .id' <<<"$all_fields"; }
phase_field=$(field_id Phase)
priority_field=$(field_id Priority)

for issue in $(printf '%s\n' "${!PHASE[@]}" | sort -n); do
  url="https://github.com/$OWNER/$REPO/issues/$issue"
  item=$(gh project item-add "$number" --owner "$OWNER" --url "$url" --format json | jq -r .id)
  gh project item-edit --id "$item" --project-id "$project_id" --field-id "$phase_field" \
    --single-select-option-id "$(option_id Phase "${PHASE_NAMES[${PHASE[$issue]}]}")" >/dev/null
  priority=$(gh issue view "$issue" --repo "$OWNER/$REPO" --json labels | jq -r '[.labels[].name | select(test("^p[0-2]$"))][0] // empty')
  if [[ -n "$priority" ]]; then
    gh project item-edit --id "$item" --project-id "$project_id" --field-id "$priority_field" \
      --single-select-option-id "$(option_id Priority "$priority")" >/dev/null
  fi
  echo "#$issue → ${PHASE_NAMES[${PHASE[$issue]}]} ${priority}"
done

echo "done: https://github.com/users/$OWNER/projects/$number"
