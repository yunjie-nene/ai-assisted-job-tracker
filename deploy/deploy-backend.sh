#!/usr/bin/env bash
set -euo pipefail

# Run through SSM as root. Build tools run as ubuntu, away from production secrets.
log() { printf '%s\n' "$*"; }
service_action() { systemctl "$1" job-tracker; }

is_latest_commit() {
  local latest
  latest=$(runuser -u ubuntu -- git ls-remote "$repository" refs/heads/main) || return 2
  [[ -n "$latest" ]] || return 2
  [[ "${latest%%[[:space:]]*}" == "$revision" ]]
}

prepare_release() {
  release=$(mktemp -d "$releases/$revision.XXXXXX")
  chown ubuntu:ubuntu "$release"
  runuser -u ubuntu -- env -i HOME=/home/ubuntu USER=ubuntu \
    PATH=/usr/local/bin:/usr/bin:/bin DOTENV_CONFIG_PATH=/dev/null \
    bash -s -- "$release" "$revision" "$repository" <<'BUILD'
set -euo pipefail
umask 022
release=$1
revision=$2
repository=$3
cd "$release"
git init --quiet .git-source
git -C .git-source remote add origin "$repository"
git -C .git-source fetch --depth=1 origin "$revision"
test "$(git -C .git-source rev-parse FETCH_HEAD)" = "$revision"
git -C .git-source archive FETCH_HEAD | tar -x -C "$release"
rm -rf -- "$release/.git-source"
cd backend
npm ci
npm run build
npm prune --omit=dev
test -f dist/server.js
BUILD
  chown -R root:root "$release"
  chmod 0755 "$release"
}

backup_database() {
  local result
  install -d -m 0700 "$backup_dir"
  backup="$backup_dir/job-tracker-$(date -u +%Y%m%dT%H%M%S)-$$.db"
  # Stop the API before taking this backup so no writes race the release switch.
  (umask 077; sqlite3 "$database" ".timeout 5000" ".backup '$backup'")
  result=$(sqlite3 "$backup" 'PRAGMA integrity_check;')
  [[ "$result" == 'ok' ]] || return 1
  log "Verified database backup: $backup"
}

switch_release() {
  local target=$1
  ln -s "$target" "$link_tmp" || return 1
  # GNU mv -T replaces the link itself, not the directory it points to.
  mv -Tf "$link_tmp" "$current"
}

wait_for_health() {
  local attempt body
  for attempt in {1..30}; do
    if systemctl is-active --quiet job-tracker; then
      body=$(curl --fail --silent --max-time 2 http://localhost:3000/health) || body=''
      if [[ "$body" == '{"status":"ok"}' ]]; then
        return 0
      fi
    fi
    sleep 2
  done
  return 1
}

recover_on_exit() {
  local result=$?
  trap - EXIT INT TERM
  if [[ "$recovery_needed" == 1 ]]; then
    log 'Deployment failed. Restoring the previous code release.'
    # Remove only our temporary link, if activation was interrupted.
    if [[ -L "$link_tmp" ]]; then rm -- "$link_tmp"; fi
    if switch_release "$previous" && service_action restart && wait_for_health; then
      log 'Previous release is healthy again.'
    else
      log 'ERROR: Recovery needs manual attention. Inspect the service on EC2.'
    fi
    # Never overwrite live data automatically, including after a schema change.
    log 'The database was not restored automatically. The backup is retained.'
    result=1
  fi
  exit "$result"
}

deploy_release() {
  local tip_status=0
  # An older, slower CI run must not replace a newer main deployment.
  is_latest_commit || tip_status=$?
  if [[ "$tip_status" == 1 ]]; then
    log 'This commit is no longer the main tip; skipping deployment.'
    return 0
  fi
  [[ "$tip_status" == 0 ]] || { log 'Unable to verify the main tip.'; return 1; }
  prepare_release
  tip_status=0
  is_latest_commit || tip_status=$?
  if [[ "$tip_status" == 1 ]]; then
    log 'Main changed during the build; leaving the running release untouched.'
    return 0
  fi
  [[ "$tip_status" == 0 ]] || { log 'Unable to verify the main tip.'; return 1; }
  recovery_needed=1
  service_action stop
  backup_database
  switch_release "$release"
  service_action start
  wait_for_health
  recovery_needed=0
  log "Deployment healthy: $revision"
  log "Previous release retained: $previous"
}

main() {
  [[ "$EUID" == 0 ]] || { log 'Run this script as root through SSM.'; return 1; }
  [[ "$#" == 1 && "$1" =~ ^[0-9a-f]{40}$ ]] || {
    log 'Expected one full commit SHA.'; return 1;
  }
  export PATH=/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
  umask 022
  revision=$1
  repository=https://github.com/yunjie-nene/ai-assisted-job-tracker.git
  releases=/opt/job-tracker/releases
  current=/opt/job-tracker/current
  database=/var/lib/job-tracker/job-tracker.db
  backup_dir=/var/backups/job-tracker
  link_tmp=/opt/job-tracker/.current-deploy-$$
  recovery_needed=0
  exec 9>/run/lock/job-tracker-deploy.lock
  flock -w 60 9 || { log 'Another deployment holds the server lock.'; return 1; }
  [[ -L "$current" && -f "$database" ]] || {
    log 'An existing deployment and database are required.'; return 1;
  }
  previous=$(readlink -f "$current")
  [[ "$previous" == "$releases/"* && -f "$previous/backend/dist/server.js" ]] || {
    log 'The current release path is invalid.'; return 1;
  }
  trap recover_on_exit EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  deploy_release
}

if [[ -z "${BASH_SOURCE[0]:-}" || "${BASH_SOURCE[0]:-}" == "$0" ]]; then
  main "$@"
fi
