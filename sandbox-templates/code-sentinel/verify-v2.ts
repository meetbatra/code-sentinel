import { Sandbox } from 'e2b';

async function verifySandbox() {
  const sandbox = await Sandbox.create('code-sentinel-dev', {
    apiKey: process.env.E2B_API_KEY,
    timeout: 120000
  });
  
  console.log(`✅ Sandbox created`);
  
  try {
    // First check if Chromium binary exists
    console.log('\n🔍 Checking Chromium installation...');
    const chromiumCheck = await sandbox.commands.run('npx playwright install --dry-run chromium');
    console.log('Chromium check:', chromiumCheck.stdout + chromiumCheck.stderr);
    
    // Try running a simple Playwright script
    console.log('\n🧪 Running Playwright...');
    const result = await sandbox.commands.run(
      'npx playwright screenshot --browser chromium https://example.com /tmp/test.png 2>&1',
      { timeout: 60000, onStdout: (d) => console.log(d), onStderr: (d) => console.error(d) }
    );
    
    console.log('\n--- Output ---');
    console.log(result.stdout);
    console.log(result.stderr);
    console.log('Exit code:', result.exitCode);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sandbox.kill();
  }
}

verifySandbox();
