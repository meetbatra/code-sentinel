import { chromium, Browser, Page } from 'playwright-core';
import fs from 'fs';

interface BrowserCommand {
  id: string;
  action: string;
  args: Record<string, any>;
}

interface BrowserResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

interface NetworkLog {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | null;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: any;
  timestamp: number;
}

const COMMAND_FILE = '/home/user/browser-command.json';
const RESPONSE_FILE = '/home/user/browser-response.json';

let browser: Browser | null = null;
let page: Page | null = null;
let consoleLogs: string[] = [];
let networkLogs: NetworkLog[] = [];
const requestMap = new WeakMap<any, NetworkLog>();

async function setupBrowser() {
  // Try to use globally installed chromium, fallback if needed
  browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const context = await browser.newContext();
  page = await context.newPage();

  page.on('console', (msg: any) => {
    const text = msg.text();
    const log = `[${msg.type()}] ${text.length > 1000 ? text.substring(0, 1000) + '...[truncated]' : text}`;
    consoleLogs.push(log);
    // Keep max 100 logs
    if (consoleLogs.length > 100) {
      consoleLogs.shift();
    }
  });

  page.on('pageerror', (error: any) => {
    consoleLogs.push(`[error] ${error.message}`);
  });

  page.on('request', (req: any) => {
    const postData = req.postData();
    const log: NetworkLog = {
      id: Math.random().toString(36).substring(7),
      url: req.url(),
      method: req.method(),
      headers: req.headers(),
      body: postData ? (postData.length > 2000 ? postData.substring(0, 2000) + '...[truncated]' : postData) : null,
      timestamp: Date.now()
    };
    requestMap.set(req, log);
    networkLogs.push(log);
    if (networkLogs.length > 50) {
      networkLogs.shift();
    }
  });

  page.on('response', async (res: any) => {
    const req = res.request();
    const log = requestMap.get(req);
    if (log) {
      log.statusCode = res.status();
      log.responseHeaders = res.headers();
      try {
        const contentType = res.headers()['content-type'] || '';
        if (contentType.includes('application/json') || contentType.includes('text/')) {
          const text = await res.text();
          if (text.length > 2000) {
            log.responseBody = text.substring(0, 2000) + '...[truncated]';
          } else {
            try {
              log.responseBody = JSON.parse(text);
            } catch {
              log.responseBody = text;
            }
          }
        }
      } catch (e) {
        // ignore errors
      }
    }
  });
}

function writeResponse(response: BrowserResponse) {
  try {
    fs.writeFileSync(RESPONSE_FILE, JSON.stringify(response));
  } catch (error) {
    console.error('Failed to write response:', error);
  }
}

async function handleCommand(command: BrowserCommand) {
  if (!page) {
    return writeResponse({
      id: command.id,
      success: false,
      error: 'Browser not initialized'
    });
  }

  const { id, action, args } = command;
  let response: BrowserResponse = { id, success: false };

  try {
    switch (action) {
      case 'navigate':
        await page.goto(args.url || 'about:blank', { waitUntil: 'networkidle' });
        response.success = true;
        response.data = { url: page.url() };
        break;
      
      case 'click':
        await page.click(args.selector);
        response.success = true;
        break;
      
      case 'fill':
        await page.fill(args.selector, args.text);
        response.success = true;
        break;
      
      case 'screenshot':
        const path = args.path || '/home/user/screenshot.png';
        await page.screenshot({ path });
        response.success = true;
        response.data = { path };
        break;
      
      case 'get-text':
        const text = await page.textContent(args.selector);
        response.success = true;
        response.data = { text };
        break;
      
      case 'read-console':
        response.success = true;
        response.data = { logs: consoleLogs };
        if (args.clear) {
          consoleLogs = [];
        }
        break;
      
      case 'wait-for-element':
        await page.waitForSelector(args.selector, { timeout: args.timeout || 5000 });
        response.success = true;
        break;

      case 'evaluate':
        const result = await page.evaluate(args.expression);
        response.success = true;
        response.data = { result };
        break;

      case 'get-network-logs':
        let filteredLogs = networkLogs;
        if (args.filter) {
          try {
            const regex = new RegExp(args.filter);
            filteredLogs = filteredLogs.filter(log => regex.test(log.url));
          } catch (e) {
            // treat as simple string inclusion if invalid regex
            filteredLogs = filteredLogs.filter(log => log.url.includes(args.filter));
          }
        }
        if (args.statusCode) {
          const codeStr = String(args.statusCode);
          if (codeStr.endsWith('xx')) {
            const prefix = codeStr.substring(0, codeStr.length - 2);
            filteredLogs = filteredLogs.filter(log => log.statusCode && String(log.statusCode).startsWith(prefix));
          } else {
            filteredLogs = filteredLogs.filter(log => log.statusCode === Number(args.statusCode));
          }
        }
        response.success = true;
        response.data = { logs: filteredLogs };
        break;

      case 'clear-network-logs':
        networkLogs = [];
        response.success = true;
        break;
        
      default:
        response.error = `Unknown action: ${action}`;
    }
  } catch (error) {
    response.success = false;
    response.error = error instanceof Error ? error.message : String(error);
  }

  writeResponse(response);
}

async function loop() {
  while (true) {
    try {
      if (fs.existsSync(COMMAND_FILE)) {
        const content = fs.readFileSync(COMMAND_FILE, 'utf-8');
        try {
          const command = JSON.parse(content) as BrowserCommand;
          // Delete command file to prevent double execution
          fs.unlinkSync(COMMAND_FILE);
          
          await handleCommand(command);
        } catch (e) {
          // JSON parse failed, likely partial file stream. Wait for the rest to arrive next tick.
        }
      }
    } catch (e) {
      console.error("Polling error:", e);
    }
    
    // Poll every 500ms
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

async function main() {
  console.log("Starting browser client...");
  await setupBrowser();
  console.log("Browser ready. Waiting for commands...");
  await loop();
}

main().catch(console.error);
