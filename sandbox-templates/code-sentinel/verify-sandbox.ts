import { Sandbox } from 'e2b';
import fs from 'fs';

async function verifySandbox() {
  console.log('📦 Creating code-sentinel-dev sandbox...');
  const sandbox = await Sandbox.create('code-sentinel-dev', {
    apiKey: process.env.E2B_API_KEY,
    timeout: 120000 // 2 minute timeout
  });
  
  console.log(`✅ Sandbox created: ${sandbox.id}`);
  
  try {
    // Verify Playwright is installed
    console.log('\n🔍 Checking Playwright installation...');
    const checkPlaywright = await sandbox.commands.run('which playwright');
    console.log(`Playwright binary: ${checkPlaywright.stdout || 'not found'}`);
    
    // Verify node_modules has playwright
    const checkModule = await sandbox.commands.run('npm list -g playwright');
    console.log(`Playwright module: ${checkModule.stdout || checkModule.stderr}`);
    
    // Copy test script into sandbox
    console.log('\n📝 Uploading test script...');
    const testScript = fs.readFileSync('./verify-playwright.js', 'utf8');
    await sandbox.files.write('/home/user/verify-playwright.js', testScript);
    
    // Run the Playwright test
    console.log('\n🧪 Running Playwright test...');
    const result = await sandbox.commands.run('node /home/user/verify-playwright.js', { 
      timeout: 60000 
    });
    
    console.log('\n--- Test Output ---');
    console.log(result.stdout);
    
    if (result.stderr) {
      console.log('\n--- Errors/Warnings ---');
      console.log(result.stderr);
    }
    
    if (result.exitCode !== 0) {
      console.error(`\n❌ Test failed with exit code ${result.exitCode}`);
      process.exit(1);
    }
    
    // Try to retrieve the screenshot
    console.log('\n📸 Retrieving screenshot...');
    const screenshot = await sandbox.files.read('/tmp/test-screenshot.png');
    if (screenshot) {
      fs.writeFileSync('./test-screenshot.png', Buffer.from(screenshot));
      console.log('✅ Screenshot saved to ./test-screenshot.png');
    }
    
    console.log('\n✅ Verification complete! Playwright works correctly.');
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    process.exit(1);
  } finally {
    console.log('\n🧹 Cleaning up sandbox...');
    await sandbox.close();
  }
}

verifySandbox();
