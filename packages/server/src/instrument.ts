import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.2,
  ignoreErrors: [
    // Expected auth failures
    /jwt/i,
    /unauthorized/i,
  ],
  beforeSend(event) {
    // Don't send 404s
    if (event.contexts?.response?.status_code === 404) return null;
    return event;
  },
});
