import { Sandbox } from 'e2b';
import fs from 'fs';

async function verifySandbox() {
  console.log('📦 Creating code-sentinel-dev sandbox...');
  const sandbox = await Sandbox.create('code-sentinel-dev', {
    apiKey: process.env.E2B_API_KEY,
    timeout: 120000
  });
  
  console.log(`✅ Sandbox created: ${sandbox.sandboxId}`);
  
  try {
    // Copy test script into sandbox
    console.log('\n📝 Uploading test script...');
    const testScript = fs.readFileSync('./verify-playwright.js', 'utf8');
    await sandbox.files.write('/home/user/verify-playwright.js', testScript);
    
    // Run the Playwright test with full error output
    console.log('\n🧪 Running Playwright test...');
    const result = await sandbox.commands.run('node /home/user/verify-playwright.js', { 
      timeout: 60000,
      onStdout: (data) => console.log('[STDOUT]', data),
      onStderr: (data) => console.error('[STDERR]', data)
    });
    
    console.log('\n--- Full Output ---');
    console.log('stdout:', result.stdout);
    console.log('stderr:', result.stderr);
    console.log('exitCode:', result.exitCode);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    console.log('\n🧹 Cleaning up sandbox...');
    await sandbox.close();
  }
}

verifySandbox();
