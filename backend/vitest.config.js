export default {
  test: {
    // no redis in the suite, so the limiters and the spend breaker take their
    // in-memory fallbacks instead of queueing commands at a socket that is not there
    env: { LOG_LEVEL: 'silent', REDIS_ENABLED: 'false' },
    coverage: {
      include: ['src/**/*.js'],
      // wiring and entrypoints, nothing to assert on
      exclude: ['src/server.js', 'src/core/logger.js', 'src/core/config.js', 'src/workers/main.js'],
    },
  },
}
