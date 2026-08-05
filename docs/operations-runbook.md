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
`SEARCHAPI_API_KEY`, `CLERK_SECRET_KEY`, `GOOGLE_CLIENT_SECRET`,
`RESEND_API_KEY`, and `CRON_SECRET`. Lambdas receive only the secret ARN and
load values at invocation time. Warm functions refresh the secret within five
minutes, so a rotated key does not require redeployment.

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

## Cost and abuse controls

API Gateway enforces 25 requests/second with a burst of 50. The API additionally
limits each authenticated user to 300 requests per five minutes and 50 costly
AI operations per UTC day. Lambda reserved concurrency caps downstream fanout.
Set `MONTHLY_AI_COST_ALERT_USD` to the desired CloudWatch threshold. If spend
spikes, lower the daily quota or relevant concurrency first, then investigate
the `Provider` and `Model` dimensions on the AI metrics.
