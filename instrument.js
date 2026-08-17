// Sentry error monitoring — must be required first, before any other code,
// so it can catch errors from every part of the app. DSN lives in Railway's
// environment variables (SENTRY_DSN), same pattern as ANTHROPIC_API_KEY —
// never hardcoded here.
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
});

module.exports = Sentry;
