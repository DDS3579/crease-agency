/** Mobile preset: simulated slow-4G, 4x CPU throttle. */
module.exports = {
  ci: {
    collect: {
      url: ['http://127.0.0.1:4180/'],
      startServerCommand: 'tsx scripts/serve.ts',
      startServerReadyPattern: 'serving dist',
      startServerReadyTimeout: 60000,
      numberOfRuns: 3,
      settings: {
        preset: 'mobile',
        chromeFlags:
          '--no-sandbox --disable-dev-shm-usage --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --force-color-profile=srgb --hide-scrollbars',
        skipAudits: ['uses-http2']
      }
    },
    assert: {
      assertions: {
        'largest-contentful-paint': ['error', { maxNumericValue: 1600 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.01 }],
        'total-blocking-time': ['error', { maxNumericValue: 150 }],
        'errors-in-console': 'error',
        'color-contrast': 'error',
        'html-has-lang': 'error',
        'meta-description': 'error',
        'image-alt': 'error',
        'link-name': 'error',
        'bypass': 'error',
        'third-party-summary': 'off',
        'uses-http2': 'off'
      }
    },
    upload: { target: 'filesystem', outputDir: 'docs/lighthouse/mobile' }
  }
};
