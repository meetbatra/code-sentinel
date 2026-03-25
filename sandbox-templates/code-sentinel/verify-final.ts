import { Sandbox } from 'e2b';

async function verifySandbox() {
  console.log('📦 Creating code-sentinel-dev sandbox...');
  const sandbox = await Sandbox.create('code-sentinel-dev', {
    apiKey: process.env.E2B_API_KEY,
    timeout: 120000
  });
  
  console.log(`✅ Sandbox created`);
  
  try {
    // Run Playwright screenshot command directly
    console.log('\n🧪 Testing Playwright...');
    const result = await sandbox.commands.run(
      'npx playwright screenshot --browser chromium --timeout 30000 https://example.com /tmp/test.png',
      { timeout: 60000 }
    );
    
    console.log('stdout:', result.stdout);
    console.log('stderr:', result.stderr);
    console.log('exitCode:', result.exitCode);
    
    if (result.exitCode === 0) {
      console.log('\n✅ SUCCESS! Playwright can launch Chromium.');
      
      // Try to check screenshot file size
      const checkFile = await sandbox.commands.run('ls -lh /tmp/test.png');
      console.log('Screenshot file:', checkFile.stdout);
    } else {
      console.log('\n❌ FAILED. See errors above.');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    console.log('\n🧹 Cleaning up...');
    await sandbox.kill();
  }
}

verifySandbox();
