#!/usr/bin/env bash
set -euo pipefail

if [[ "${RECOVERY_DRILL_CONFIRM:-}" != "staging-only" ]]; then
  echo "Set RECOVERY_DRILL_CONFIRM=staging-only to run the isolated drill." >&2
  exit 2
fi

if [[ "${RECOVERY_STAGE:-}" != "staging" ]]; then
  echo "Recovery drills are restricted to the staging environment." >&2
  exit 2
fi

: "${RECOVERY_DYNAMODB_TABLE:?RECOVERY_DYNAMODB_TABLE is required}"
: "${RECOVERY_RDS_INSTANCE:?RECOVERY_RDS_INSTANCE is required}"
: "${RECOVERY_S3_BUCKET:?RECOVERY_S3_BUCKET is required}"

drill_id="$(date -u +%Y%m%d%H%M%S)"
restore_table="curriq-restore-drill-${drill_id}"
snapshot_id="curriq-restore-drill-${drill_id}"
restore_db="curriq-restore-drill-${drill_id}"
s3_key="recovery-drill/${drill_id}.txt"
tmp_dir="$(mktemp -d)"

cleanup() {
  status=$?
  trap - EXIT

  if aws dynamodb describe-table --table-name "${restore_table}" >/dev/null 2>&1; then
    aws dynamodb delete-table --table-name "${restore_table}" >/dev/null 2>&1 || true
    aws dynamodb wait table-not-exists --table-name "${restore_table}" || true
  fi

  if aws rds describe-db-instances --db-instance-identifier "${restore_db}" >/dev/null 2>&1; then
    deletion_protection="$(aws rds describe-db-instances --db-instance-identifier "${restore_db}" --query 'DBInstances[0].DeletionProtection' --output text)"
    if [[ "${deletion_protection}" == "True" ]]; then
      aws rds modify-db-instance --db-instance-identifier "${restore_db}" --no-deletion-protection --apply-immediately >/dev/null 2>&1 || true
      aws rds wait db-instance-available --db-instance-identifier "${restore_db}" || true
    fi
    aws rds delete-db-instance --db-instance-identifier "${restore_db}" --skip-final-snapshot --delete-automated-backups >/dev/null 2>&1 || true
    aws rds wait db-instance-deleted --db-instance-identifier "${restore_db}" || true
  fi

  if aws rds describe-db-snapshots --db-snapshot-identifier "${snapshot_id}" >/dev/null 2>&1; then
    aws rds delete-db-snapshot --db-snapshot-identifier "${snapshot_id}" >/dev/null 2>&1 || true
    aws rds wait db-snapshot-deleted --db-snapshot-identifier "${snapshot_id}" || true
  fi

  versions="$(aws s3api list-object-versions --bucket "${RECOVERY_S3_BUCKET}" --prefix "${s3_key}" --query 'Versions[].{Key:Key,VersionId:VersionId}' --output json)"
  if [[ "${versions}" != "[]" && "${versions}" != "null" ]]; then
    aws s3api delete-objects --bucket "${RECOVERY_S3_BUCKET}" --delete "{\"Objects\":${versions},\"Quiet\":true}" >/dev/null || true
  fi
  delete_markers="$(aws s3api list-object-versions --bucket "${RECOVERY_S3_BUCKET}" --prefix "${s3_key}" --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}' --output json)"
  if [[ "${delete_markers}" != "[]" && "${delete_markers}" != "null" ]]; then
    aws s3api delete-objects --bucket "${RECOVERY_S3_BUCKET}" --delete "{\"Objects\":${delete_markers},\"Quiet\":true}" >/dev/null || true
  fi
  rm -r "${tmp_dir}"
  exit "${status}"
}
trap cleanup EXIT

echo "Restoring DynamoDB table ${RECOVERY_DYNAMODB_TABLE} to ${restore_table}..."
aws dynamodb restore-table-to-point-in-time \
  --source-table-name "${RECOVERY_DYNAMODB_TABLE}" \
  --target-table-name "${restore_table}" \
  --use-latest-restorable-time >/dev/null
aws dynamodb wait table-exists --table-name "${restore_table}"
source_count="$(aws dynamodb scan --table-name "${RECOVERY_DYNAMODB_TABLE}" --select COUNT --query Count --output text)"
restore_count="$(aws dynamodb scan --table-name "${restore_table}" --select COUNT --query Count --output text)"
test "${source_count}" = "${restore_count}"

echo "Restoring an earlier S3 object version from ${RECOVERY_S3_BUCKET}..."
printf 'version-one' >"${tmp_dir}/one.txt"
printf 'version-two' >"${tmp_dir}/two.txt"
first_version="$(aws s3api put-object --bucket "${RECOVERY_S3_BUCKET}" --key "${s3_key}" --body "${tmp_dir}/one.txt" --query VersionId --output text)"
aws s3api put-object --bucket "${RECOVERY_S3_BUCKET}" --key "${s3_key}" --body "${tmp_dir}/two.txt" >/dev/null
aws s3api get-object --bucket "${RECOVERY_S3_BUCKET}" --key "${s3_key}" --version-id "${first_version}" "${tmp_dir}/restored.txt" >/dev/null
test "$(<"${tmp_dir}/restored.txt")" = "version-one"

echo "Creating RDS snapshot ${snapshot_id}..."
aws rds create-db-snapshot --db-instance-identifier "${RECOVERY_RDS_INSTANCE}" --db-snapshot-identifier "${snapshot_id}" >/dev/null
aws rds wait db-snapshot-available --db-snapshot-identifier "${snapshot_id}"
echo "Restoring isolated RDS instance ${restore_db}..."
aws rds restore-db-instance-from-db-snapshot --db-instance-identifier "${restore_db}" --db-snapshot-identifier "${snapshot_id}" --db-instance-class db.t4g.micro --no-publicly-accessible >/dev/null
aws rds wait db-instance-available --db-instance-identifier "${restore_db}"
aws rds describe-db-instances --db-instance-identifier "${restore_db}" --query 'DBInstances[0].DBInstanceStatus' --output text | grep -qx available

echo "Recovery drill passed: DynamoDB count matched, an S3 version was restored, and an RDS snapshot restored to an available isolated instance."
