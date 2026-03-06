module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/utils/**/*.js',
    'src/services/**/*.js',
    'src/middleware/**/*.js',
    '!src/services/scheduler.js',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
