# Playbook: Refresh Strava Tokens Manually

1. Locate user ID (`app_user.id`) in Supabase.
2. Ensure `REFRESH_TOKEN` valid; if expired, re-run OAuth flow via `/` to obtain new token.
3. Update `strava_token` table manually:
   ```sql
   UPDATE strava_token
     SET refresh_token = '<new>', access_token = '<new>', expires_at = to_timestamp(<epoch>)
   WHERE user_id = '<user-id>';
   ```
4. Trigger background reprocessing if needed:
   ```bash
   curl -X POST https://<netlify-site>/.netlify/functions/activity-process-background \
     -H 'content-type: application/json' \
     -d '{"userId":"<user-id>","stravaActivityId":<activity-id>,"source":"webhook"}'
   ```
5. Kick annotation manually if queued:
   ```bash
   curl -X POST https://<netlify-site>/.netlify/functions/strava-annotate \
     -H 'content-type: application/json' \
     -d '{"activityId":"<activity-row-uuid>"}'
   ```
