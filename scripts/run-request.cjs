/**
 * Run a request against the agent API. Uses native fetch (Node 18+).
 * No curl dependency - works on all platforms.
 *
 * Usage: node scripts/run-request.cjs <request-file>
 * Example: node scripts/run-request.cjs requests/run-once-goal.json
 */

const { readFileSync } = require('fs');
const { join } = require('path');

const port = Number(process.env.PORT) || 3000;
const baseUrl = `http://127.0.0.1:${port}`;

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: node scripts/run-request.cjs <request-file>');
    console.error('Example: node scripts/run-request.cjs requests/run-once-goal.json');
    process.exit(1);
  }

  const filePath = fileArg.startsWith('/') ? fileArg : join(process.cwd(), fileArg);
  let body;
  try {
    body = readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`Failed to read ${filePath}:`, err.message);
    process.exit(1);
  }

  try {
    const res = await fetch(`${baseUrl}/agent/run-once`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`HTTP ${res.status}`);
      console.error(text);
      process.exit(1);
    }
    try {
      const json = JSON.parse(text);
      console.log(JSON.stringify(json, null, 2));
    } catch {
      console.log(text);
    }
  } catch (err) {
    console.error('Request failed:', err.message);
    process.exit(1);
  }
}

main();
