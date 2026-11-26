// Test-only environment. Loaded before any app module via `node --import`.
process.env.DATABASE_PATH ??= ':memory:';
process.env.SESSION_SECRET ??= 'test-secret';
process.env.SECURE_COOKIES ??= 'false';
