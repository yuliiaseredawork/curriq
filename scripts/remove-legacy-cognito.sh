#!/usr/bin/env bash
set -euo pipefail

stage="${1:-}"
case "${stage}" in
  dev|staging|prod) ;;
  *)
    echo "Usage: remove-legacy-cognito.sh dev|staging|prod" >&2
    exit 2
    ;;
esac

stack_name="Curriq-Auth-${stage}"
if ! aws cloudformation describe-stacks --stack-name "${stack_name}" >/dev/null 2>&1; then
  echo "Legacy Cognito stack ${stack_name} is already absent."
  exit 0
fi

resource_types="$(aws cloudformation list-stack-resources --stack-name "${stack_name}" --query "StackResourceSummaries[].ResourceType" --output text)"
unexpected=""
for resource_type in ${resource_types}; do
  case "${resource_type}" in
    AWS::Cognito::*|AWS::CDK::Metadata) ;;
    *) unexpected="${unexpected} ${resource_type}" ;;
  esac
done
if [[ -n "${unexpected}" ]]; then
  echo "Refusing to delete ${stack_name}; unexpected resource types: ${unexpected}" >&2
  exit 3
fi

aws cloudformation delete-stack --stack-name "${stack_name}"
aws cloudformation wait stack-delete-complete --stack-name "${stack_name}"
echo "Deleted the unused Clerk-replaced Cognito stack ${stack_name}."
