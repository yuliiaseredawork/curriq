# Curriq operations runbook

## Alerts and first response

The `curriq-<stage>-operations` CloudWatch dashboard is the starting point. It
contains API p95 latency/errors, AI token and estimated-cost metrics, and the
durable course-job backlog. `OperationalAlerts` receives API error, latency,
AI-cost, and dead-letter alarms through the API and ingestion alert topics; set
`ALERT_EMAIL` before deployment and confirm both SNS subscriptions.

1. Capture the `x-correlation-id` returned to the client.
2. Search the API and worker log groups for that ID or the course ID. Logs are
   JSON and retained for 30 days; they intentionally omit tokens, email
   addresses, and user IDs.
3. Course jobs retry with exponential visibility backoff before moving to the
   DLQ. If `CourseJobsDlqAlarm` or `QuizJobsDlqAlarm` is active, inspect one message,
   fix the underlying cause, and redrive the DLQ from the SQS console. Do not
   copy credentials or uploaded content into tickets.
4. The recovery worker requeues non-terminal courses unchanged for 30 minutes.
   A user can also use the authenticated retry endpoint after a course reaches
   `FAILED`.

## Credential rotation

Provider credentials live in one JSON Secrets Manager secret named
`curriq/<stage>/providers` by default. Required keys are
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `YOUTUBE_API_KEY`,
`SEARCHAPI_API_KEY`, `CLERK_SECRET_KEY`, `RESEND_API_KEY`,
`UNSUBSCRIBE_SIGNING_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`,
`STRIPE_WEBHOOK_SECRET`, and `ADMIN_CLERK_USER_IDS`. Lambdas receive only the
secret ARN and load values at invocation time. Warm functions refresh the
secret within five minutes, so a rotated key does not require redeployment.

For a suspected exposure, revoke and recreate the key at the provider first,
then update the matching JSON field in Secrets Manager. Publish the secret as
one atomic version, invoke `/health`, perform one authenticated read, and run a
small course import. Revoke any still-valid old version after verification.
Rotating the Secrets Manager value alone does not revoke the provider-side key.

## Upload incidents

PDF uploads are limited to 20 MiB, 300 pages, and 2,000,000 extracted
characters. GuardDuty scans `pdf-uploads/` and tags clean objects before the API
will process them. Threats, invalid MIME/signatures, and oversized files are
deleted immediately. Unfinished uploads expire after one day.

If clean files remain in `MALWARE_SCAN_PENDING`, inspect the GuardDuty Malware
Protection plan status and its IAM role. Never disable `REQUIRE_MALWARE_SCAN`
in production to clear a backlog.

The current AWS free-plan account blocks GuardDuty subscription APIs, so
non-production stacks leave malware protection disabled and do not claim that
uploads were scanned. Production always synthesizes the protection plan and
must not be deployed until the account plan supports GuardDuty. Set
`ENABLE_MALWARE_PROTECTION=true` in a supported staging account to exercise the
full upload scan before production promotion.

The same free-plan account blocks RDS Proxy. Non-production stacks therefore
connect to the private RDS endpoint while retaining the two-connection warm
Lambda pool. Production always synthesizes RDS Proxy and must be deployed from
an account plan that supports it. Set `ENABLE_RDS_PROXY=true` in a supported
staging account to validate proxy behavior before production promotion.

This account's Lambda concurrency quota is also too small to reserve capacity
without violating AWS's minimum unreserved pool. Production always synthesizes
the per-function reserved-concurrency caps. Constrained staging relies on API
Gateway throttling, SQS event-source concurrency, and per-user quotas; set
`ENABLE_RESERVED_CONCURRENCY=true` after raising the account quota to validate
the production caps.

## Cost and abuse controls

API Gateway enforces 25 requests/second with a burst of 50. The API additionally
limits each authenticated user to 300 requests per five minutes. Free accounts
receive 20 costly AI operations per UTC day; active Pro accounts receive 500.
Past-due and canceled subscriptions immediately return to free limits. Lambda
reserved concurrency caps downstream fanout.
Set `MONTHLY_AI_COST_ALERT_USD` to the desired CloudWatch threshold. If spend
spikes, lower the daily quota or relevant concurrency first, then investigate
the `Provider` and `Model` dimensions on the AI metrics.

## Backups and restore drills

DynamoDB point-in-time recovery and S3 versioning are enabled on every
application table and bucket. The current free-plan account keeps one day of
staging RDS backups; production requires an upgraded plan and keeps 35 days.
RDS retains automated backups, encrypts storage, snapshots on
stack removal, and has deletion protection outside development. Never disable
these controls to unblock a deployment.

The monthly `Recovery drill` workflow restores the staging Users table at the
latest recoverable time, retrieves an older S3 object version, and restores an
RDS snapshot into an isolated temporary instance. It compares DynamoDB counts
and waits for the RDS copy to become available before deleting only resources
whose names start with `curriq-restore-drill-`. A failed drill pages the staging
recovery environment owner. Record recovery time and any manual intervention
in the incident log.

For a real recovery, stop writes, capture the incident timestamp, restore to
new resources, validate ownership counts and representative course artifacts,
then update stack configuration or DNS. Never restore over the damaged source.
The target objectives are RPO under five minutes for DynamoDB, under 24 hours
for RDS, and zero committed S3 versions; RTO is four hours.

## Database migrations

Migrations are append-only in `backend/src/migrations/registry.ts`. Each deploy
invokes the migration custom resource through RDS Proxy before dependent
application changes complete. The runner takes a Postgres advisory lock,
records version plus checksum in `schema_migrations`, and refuses modified
history. Make schema changes backward-compatible because automated code
rollback intentionally leaves already-applied forward migrations in place.

## Deployment and rollback

CI must pass type-check, lint, unit tests, production build, CDK synth,
dependency audit, and Playwright discovery. A successful main build deploys
the staging CDK stacks, creates an immutable Vercel candidate, points the
staging domain to it, then runs smoke, critical E2E, and bounded load tests.

Production is a manual GitHub Environment promotion of an exact staging-tested
SHA. It builds a Vercel production candidate before deploying CDK, applies
migrations, promotes the same artifact, and runs post-deployment checks. A
failed check runs `vercel rollback` and redeploys the last healthy SHA stored
in SSM. CloudFormation performs its own rollback when a stack update fails.
Protect the production environment with required reviewers.

After all checks pass, deployment deletes the orphaned `Curriq-Auth-<stage>`
Cognito stack. The cleanup script first refuses any stack containing a
non-Cognito resource. Clerk is the sole authentication provider; do not add a
second identity store or restore the legacy stack during an incident.

Required GitHub configuration: environment-scoped Vercel token/org/project
secrets, AWS OIDC deployment and recovery roles, Clerk E2E keys/users, and the
staging/production app and API URL variables used by the workflows.

## Privacy, billing, and support

Users can export live account/course/learning data, opt out of reminders, and
delete their Clerk identity and live data from Account. Versioned objects are
explicitly deleted; deleted database records expire from backups within the
documented backup window. Abandoned uploads expire in one day, raw artifacts
in 90 days, noncurrent object versions in 30 days, and pseudonymous analytics
in 400 days.

Stripe webhooks are raw-body signature verified and idempotently claimed.
`invoice.payment_failed` moves the account to free limits and emails the user;
`invoice.paid` restores Pro; cancellation removes Pro access. The admin events
endpoint requires the calling Clerk subject in `ADMIN_CLERK_USER_IDS` and is
the support queue for feedback. Never put account email addresses or raw Clerk
subjects in logs or tickets.
