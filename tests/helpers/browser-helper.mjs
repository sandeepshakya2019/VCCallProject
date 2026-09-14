import { spawn } from 'child_process';
import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Reusable CDP-based browser test controller.
 * Runs headless Chrome with fake media devices and WebRTC enabled.
 */
export class BrowserTestCluster {
  constructor(port = 9499) {
    this.port = port;
    this.chromeProc = null;
    this.profileDir = null;
    this.openTabs = [];
  }

  async launch() {
    this.profileDir = join(tmpdir(), `vccall_prof_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    mkdirSync(this.profileDir, { recursive: true });

    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

    this.chromeProc = spawn(chromePath, [
      '--headless=new',
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.profileDir}`,
      '--ignore-certificate-errors',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--window-size=1440,900',
      '--no-first-run',
      '--no-default-browser-check',
      '--autoplay-policy=no-user-gesture-required',
      'about:blank'
    ]);

    await new Promise((r) => setTimeout(r, 2000));
  }

  async createTab(url, name = 'Tab') {
    const newTabRes = await fetch(`http://127.0.0.1:${this.port}/json/new?${encodeURIComponent(url)}`, {
      method: 'PUT',
    });
    const tabData = await newTabRes.json();
    const ws = new WebSocket(tabData.webSocketDebuggerUrl);

    let idCounter = 1;
    const callbacks = new Map();
    const logs = [];

    const send = (method, params = {}) => {
      const id = idCounter++;
      return new Promise((resolve) => {
        callbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Runtime.consoleAPICalled') {
          const type = msg.params.type;
          const text = msg.params.args.map((a) => a.value ?? JSON.stringify(a)).join(' ');
          logs.push({ type, text, time: Date.now() });
          if (text.includes('WebRTC') || text.includes('Admin') || text.includes('PeerJS') || text.includes('DataConn')) {
            console.log(`    [${name} ${type}]:`, text);
          }
        }
        if (msg.id && callbacks.has(msg.id)) {
          const cb = callbacks.get(msg.id);
          callbacks.delete(msg.id);
          cb(msg.result);
        }
      } catch {}
    };

    await new Promise((resolve) => {
      ws.onopen = async () => {
        await send('Runtime.enable');
        await send('Page.enable');
        resolve();
      };
    });

    const tabController = {
      name,
      ws,
      logs,
      send,
      async evalCode(expression) {
        const code = typeof expression === 'function' ? `(${expression.toString()})()` : expression;
        const res = await send('Runtime.evaluate', {
          expression: code,
          returnByValue: true,
          awaitPromise: true,
        });
        if (res?.result?.value !== undefined) return res.result.value;
        if (res?.result?.subtype === 'node') return true;
        if (res?.result?.type === 'object') return res.result;
        return res?.result?.value;
      },
      async waitFor(fn, timeoutMs = 12000, intervalMs = 250) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          try {
            const res = await this.evalCode(fn);
            if (res) return res;
          } catch {}
          await new Promise((r) => setTimeout(r, intervalMs));
        }
        throw new Error(`Timeout waiting for condition in ${name} after ${timeoutMs}ms`);
      },
      async mockDialogs() {
        await this.evalCode(`
          window.__dialogs = [];
          window.alert = (msg) => {
            window.__dialogs.push({ type: 'alert', msg });
            console.log('[Mock Alert]:', msg);
          };
          window.confirm = (msg) => {
            window.__dialogs.push({ type: 'confirm', msg });
            console.log('[Mock Confirm]:', msg);
            return true;
          };
        `);
      },
      async close() {
        try {
          ws.close();
        } catch {}
      }
    };

    this.openTabs.push(tabController);
    return tabController;
  }

  async close() {
    for (const tab of this.openTabs) {
      await tab.close();
    }
    if (this.chromeProc) {
      this.chromeProc.kill();
      this.chromeProc = null;
    }
    if (this.profileDir) {
      try {
        rmSync(this.profileDir, { recursive: true, force: true });
      } catch {}
    }
  }
}
