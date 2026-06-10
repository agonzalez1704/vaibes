#!/usr/bin/env bash
# Purge Vibes test data — InsForge DB rows + matching Clerk users.
#
#   ./scripts/purge-db.sh user@example.com    → wipe that user by email (DB cascade + Clerk delete)
#   ./scripts/purge-db.sh user_2abc...        → wipe that user by Clerk id
#   ./scripts/purge-db.sh                      → wipe ALL users (asks to confirm)
#
# All child tables (social_handles, profiles, scrape_jobs, phrases,
# deliveries, preferences, consents) have ON DELETE CASCADE on users(id),
# so deleting the users row removes everything tied to it in the DB.
#
# Requires: curl, jq, npx. CLERK_SECRET_KEY is pulled from InsForge secrets.

set -euo pipefail
cd "$(dirname "$0")/.."

CLI="npx @insforge/cli"
ARG="${1:-}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing dependency: $1"; exit 1; }; }
need curl
need jq

run_sql() { $CLI db query "$1"; }

# Pull Clerk secret once. Missing = warn and only purge DB.
fetch_clerk_secret() {
  $CLI secrets get CLERK_SECRET_KEY 2>/dev/null | grep -oE 'sk_[A-Za-z0-9_]+' | head -1
}
CLERK_SK="$(fetch_clerk_secret || true)"
if [ -z "$CLERK_SK" ]; then
  echo "⚠️  CLERK_SECRET_KEY not found in InsForge secrets — will only purge DB rows, Clerk users left intact."
fi

clerk_delete_user() {
  local uid="$1"
  [ -z "$CLERK_SK" ] && return 0
  [ -z "$uid" ] && return 0
  local code
  code=$(curl -sS -o /tmp/clerk-del.out -w "%{http_code}" \
    -X DELETE "https://api.clerk.com/v1/users/$uid" \
    -H "Authorization: Bearer $CLERK_SK")
  if [ "$code" = "200" ] || [ "$code" = "204" ]; then
    echo "  ✓ Clerk user $uid deleted."
  else
    echo "  ✗ Clerk delete $uid failed (HTTP $code): $(cat /tmp/clerk-del.out | head -c 300)"
  fi
}

clerk_find_user_id_by_email() {
  local email="$1"
  [ -z "$CLERK_SK" ] && return 0
  curl -sS -G "https://api.clerk.com/v1/users" \
    --data-urlencode "email_address=$email" \
    -H "Authorization: Bearer $CLERK_SK" \
    | jq -r '.[0].id // empty'
}

clerk_list_all_user_ids() {
  [ -z "$CLERK_SK" ] && return 0
  local offset=0 limit=100 batch
  while :; do
    batch=$(curl -sS -G "https://api.clerk.com/v1/users" \
      --data-urlencode "limit=$limit" \
      --data-urlencode "offset=$offset" \
      -H "Authorization: Bearer $CLERK_SK" \
      | jq -r '.[].id')
    [ -z "$batch" ] && break
    echo "$batch"
    local n; n=$(echo "$batch" | wc -l | tr -d ' ')
    [ "$n" -lt "$limit" ] && break
    offset=$((offset + limit))
  done
}

if [ -n "$ARG" ]; then
  SAFE="${ARG//\'/\'\'}"
  if [[ "$ARG" == user_* ]]; then
    # Clerk id given directly
    CLERK_ID="$ARG"
    WHERE="id = '$SAFE'"
  else
    # Email given — look up Clerk id (DB row may not exist if user never opened the app)
    WHERE="email = '$SAFE'"
    CLERK_ID=""
    DB_ID=$(run_sql "select id from users where $WHERE" 2>/dev/null | grep -oE 'user_[A-Za-z0-9]+' | head -1 || true)
    if [ -n "$DB_ID" ]; then
      CLERK_ID="$DB_ID"
    else
      CLERK_ID="$(clerk_find_user_id_by_email "$ARG" || true)"
    fi
  fi

  echo "Target: $ARG"
  echo "  Clerk id: ${CLERK_ID:-<none>}"
  run_sql "select id, email, created_at from users where $WHERE"
  read -r -p "Delete this user from DB and Clerk? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

  run_sql "delete from users where $WHERE"
  echo "  ✓ DB rows purged."

  clerk_delete_user "$CLERK_ID"
  echo "Done."
else
  echo "No target given → this wipes ALL users (DB + Clerk)."
  read -r -p "Type PURGE to confirm: " ans
  [[ "$ans" == "PURGE" ]] || { echo "Aborted."; exit 0; }

  # DB-side: defensive purge of children, then users
  run_sql "delete from deliveries; delete from phrases; delete from scrape_jobs; delete from consents; delete from preferences; delete from profiles; delete from social_handles; delete from users"
  echo "  ✓ DB tables purged."

  # Clerk-side: list every user and delete one by one
  if [ -n "$CLERK_SK" ]; then
    IDS="$(clerk_list_all_user_ids || true)"
    if [ -z "$IDS" ]; then
      echo "  (no Clerk users to delete)"
    else
      while IFS= read -r uid; do
        [ -z "$uid" ] && continue
        clerk_delete_user "$uid"
      done <<< "$IDS"
    fi
  fi
  echo "Done. All test data purged."
fi
