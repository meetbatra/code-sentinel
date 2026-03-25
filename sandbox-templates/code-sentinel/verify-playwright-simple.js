// Use Playwright CLI instead of requiring the module
const { execSync } = require('child_process');

console.log('🚀 Testing Playwright with simple navigation...');

try {
  // Use npx playwright codegen to verify browser launch
  const result = execSync(
    'npx playwright screenshot --browser chromium --timeout 30000 https://example.com /tmp/test-screenshot.png',
    { encoding: 'utf8', stdio: 'pipe' }
  );
  
  console.log('✅ Playwright verification successful!');
  console.log('📸 Screenshot saved to /tmp/test-screenshot.png');
  process.exit(0);
} catch (error) {
  console.error('❌ Playwright verification failed:', error.message);
  console.error(error.stderr || error.stdout);
  process.exit(1);
}
