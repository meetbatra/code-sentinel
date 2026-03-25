const { chromium } = require('playwright');

async function testPlaywright() {
  console.log('🚀 Launching Chromium...');
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required in containerized environments
  });
  
  const page = await browser.newPage();
  console.log('🌐 Navigating to example.com...');
  await page.goto('https://example.com');
  
  const title = await page.title();
  console.log(`📄 Page title: ${title}`);
  
  console.log('📸 Taking screenshot...');
  await page.screenshot({ path: '/tmp/test-screenshot.png' });
  
  console.log('✅ Playwright verification successful!');
  await browser.close();
}

testPlaywright().catch((err) => {
  console.error('❌ Playwright verification failed:', err);
  process.exit(1);
});
