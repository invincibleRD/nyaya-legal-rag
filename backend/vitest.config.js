export default {
  test: {
    env: { LOG_LEVEL: 'silent' },
    coverage: {
      include: ['src/**/*.js'],
      // wiring and entrypoints, nothing to assert on
      exclude: ['src/server.js', 'src/core/logger.js', 'src/core/config.js', 'src/workers/main.js'],
    },
  },
}
