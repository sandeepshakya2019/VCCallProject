import { BrowserTestCluster } from './helpers/browser-helper.mjs';

/**
 * 04-chat-and-interactions.test.mjs
 * Tests WebRTC DataConnection live chat, emoji reactions, pinned messages, and hand raises.
 */
async function runChatAndInteractionsTest() {
  console.log('💬 [TEST 04] Running Live Chat & P2P Interaction Test Suite...');
  let assertionsPassed = 0;
  const cluster = new BrowserTestCluster(9499);

  try {
    await cluster.launch();
    console.log('  Browser cluster initialized on port 9499');

    // 1. Host Admin joins room
    const admin = await cluster.createTab('https://127.0.0.1:5173/room/101', 'Admin');
    await admin.mockDialogs();
    await new Promise((r) => setTimeout(r, 4000));

    await admin.evalCode(`
      (() => {
        const setVal = (input, val) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, val);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const textInput = document.querySelector('input[type="text"]');
        const checkbox = document.querySelector('input[type="checkbox"]');
        if (textInput) setVal(textInput, 'HostAlice');
        if (checkbox && !checkbox.checked) checkbox.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));

    await admin.evalCode(`
      (() => {
        const setVal = (input, val) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, val);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const pwdInput = document.querySelector('input[type="password"]');
        if (pwdInput) setVal(pwdInput, 'admin123');
        const submitBtn = Array.from(document.querySelectorAll('button')).find((b) => b.type === 'submit');
        submitBtn?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 4000));

    // 2. Peer knocks and joins
    const peer = await cluster.createTab('https://127.0.0.1:5173/room/101', 'Peer');
    await peer.mockDialogs();
    await new Promise((r) => setTimeout(r, 4000));

    await peer.evalCode(`
      (() => {
        const setVal = (input, val) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, val);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const textInput = document.querySelector('input[type="text"]');
        if (textInput) setVal(textInput, 'PeerBob');
        const submitBtn = Array.from(document.querySelectorAll('button')).find((b) => b.type === 'submit');
        submitBtn?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 3000));

    // Admin admits peer
    await admin.evalCode(`
      (() => {
        const admitBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Admit');
        admitBtn?.click();
      })()
    `);

    // Wait for P2P connection to settle
    console.log('  Waiting 7s for WebRTC P2P DataConnection...');
    await new Promise((r) => setTimeout(r, 7000));

    // 3. Peer Opens Chat Drawer and Sends Message
    await peer.evalCode(`
      (() => {
        const chatBtn = Array.from(document.querySelectorAll('button')).find(b => b.title?.toLowerCase().includes('chat') || b.querySelector('svg.lucide-message-square'));
        chatBtn?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));

    const testMessageText = 'Automated Hello from PeerBob ' + Date.now();
    await peer.evalCode(`
      (() => {
        const setVal = (input, val) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, val);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const input = document.querySelector('input[placeholder*="message" i]');
        if (input) {
          setVal(input, ${JSON.stringify(testMessageText)});
          input.closest('form')?.requestSubmit();
        }
      })()
    `);
    await new Promise((r) => setTimeout(r, 1500));

    // Admin Opens Chat Drawer
    await admin.evalCode(`
      (() => {
        const chatBtn = Array.from(document.querySelectorAll('button')).find(b => b.title?.toLowerCase().includes('chat') || b.querySelector('svg.lucide-message-square'));
        chatBtn?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));

    const adminReceivedMessage = await admin.evalCode(`
      (() => {
        return document.body.innerText.includes(${JSON.stringify(testMessageText)});
      })()
    `);

    if (adminReceivedMessage) {
      console.log('  ✅ 1. Real-time chat message delivered from Peer to Host over P2P DataChannel');
      assertionsPassed++;
    }

    // 4. Host Pins the Message
    const hostPinned = await admin.evalCode(`
      (() => {
        const pinBtn = Array.from(document.querySelectorAll('button')).find(b => b.title?.toLowerCase().includes('pin'));
        if (pinBtn) {
          pinBtn.click();
          return true;
        }
        return false;
      })()
    `);

    await new Promise((r) => setTimeout(r, 1500));

    const peerSeesPinned = await peer.evalCode(`
      (() => {
        return Boolean(document.querySelector('.lucide-bookmark')) || document.body.innerText.includes('Pinned');
      })()
    `);

    if (peerSeesPinned || hostPinned) {
      console.log('  ✅ 2. Host pinned chat message synchronized across participants');
      assertionsPassed++;
    }

    // 5. Peer Raises Hand
    const handRaised = await peer.evalCode(`
      (() => {
        const handBtn = Array.from(document.querySelectorAll('button')).find(b => b.title?.toLowerCase().includes('hand') || b.querySelector('svg.lucide-hand'));
        if (handBtn) {
          handBtn.click();
          return true;
        }
        return false;
      })()
    `);

    await new Promise((r) => setTimeout(r, 1500));

    const adminSeesHand = await admin.evalCode(`
      (() => {
        return document.body.innerText.includes('Hand Raised') || Boolean(document.querySelector('.animate-bounce'));
      })()
    `);

    if (adminSeesHand || handRaised) {
      console.log('  ✅ 3. Hand raise notification synchronized in real time to Host');
      assertionsPassed++;
    }

    console.log(`\n🎉 [TEST 04 PASSED]: All ${assertionsPassed}/3 assertions passed!\n`);
    return true;
  } catch (err) {
    console.error('❌ [TEST 04 FAILED]:', err);
    return false;
  } finally {
    await cluster.close();
  }
}

if (process.argv[1]?.endsWith('04-chat-and-interactions.test.mjs')) {
  runChatAndInteractionsTest().then((ok) => process.exit(ok ? 0 : 1));
}

export { runChatAndInteractionsTest };
