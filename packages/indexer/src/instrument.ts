import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enableLogs: true,
  integrations: [
    Sentry.pinoIntegration({ log: { levels: ["info", "warn", "error"] } }),
    Sentry.postgresIntegration(),
  ],
});
