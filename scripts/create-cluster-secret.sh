#!/usr/bin/env bash
# Phase 19 / Task F1: create the homecal-secrets Secret in the cluster.
#
# Reads real secret values from a local env file (default: ./cluster-secrets.env,
# gitignored) and creates the k8s Secret out-of-band. The chart wires its env
# via secretKeyRef to this Secret; the chart itself never sees plaintext.
#
# Usage:
#   1. Copy the template:    cp deploy/cluster-secrets.env.example cluster-secrets.env
#   2. Edit cluster-secrets.env with real values (NEVER commit it).
#   3. Run this script:      bash scripts/create-cluster-secret.sh
#   4. Verify:               kubectl -n homecal get secret homecal-secrets -o yaml
#
# Keys required (matches the secretKeyRef references in deploy/chart/templates/):
#   DATABASE_URL         postgres://homecal:<password>@homecal-db:5432/homecal_prod
#   BETTER_AUTH_SECRET   openssl rand -base64 32
#   POSTGRES_PASSWORD    same password as in DATABASE_URL (initdb consumes it)
# Optional:
#   EMAIL_PASSWORD       Gmail app password
#   APNS_PRIVATE_KEY     contents of the .p8 cert (multi-line OK)
#
# Sealed Secrets (encrypt at rest in arch-infra) is a planned follow-up — a
# no-downtime env-source swap once the operator is installed cluster-wide.

set -euo pipefail

NAMESPACE="${HOMECAL_NS:-homecal}"
SECRET_NAME="${HOMECAL_SECRET_NAME:-homecal-secrets}"
ENV_FILE="${HOMECAL_SECRET_ENV:-./cluster-secrets.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Copy deploy/cluster-secrets.env.example and edit." >&2
  exit 1
fi

# Ensure namespace exists (Argo CD also creates it via CreateNamespace=true,
# but we may run this before the Application is committed).
kubectl get namespace "$NAMESPACE" >/dev/null 2>&1 \
  || kubectl create namespace "$NAMESPACE"

# Recreate the secret idempotently. Apply via --dry-run | apply keeps it
# server-side compatible with ArgoCD's sync.
kubectl create secret generic "$SECRET_NAME" \
  --namespace="$NAMESPACE" \
  --from-env-file="$ENV_FILE" \
  --dry-run=client -o yaml \
  | kubectl apply -f -

echo
echo "Created/updated $NAMESPACE/$SECRET_NAME"
echo "Keys present:"
kubectl -n "$NAMESPACE" get secret "$SECRET_NAME" -o jsonpath='{.data}' \
  | tr ',' '\n' | grep -oE '"[A-Z_]+":' | tr -d '":'
