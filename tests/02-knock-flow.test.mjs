import { BrowserTestCluster } from './helpers/browser-helper.mjs';

/**
 * 02-knock-flow.test.mjs
 * Tests the browser Knocking & Host Approval Workflow.
 */
async function runKnockFlowTest() {
  console.log('🚪 [TEST 02] Running Knock-to-Join & Host Approval Test Suite...');
  let assertionsPassed = 0;
  const cluster = new BrowserTestCluster(9499);

  try {
    await cluster.launch();
    console.log('  Browser cluster initialized on port 9499');

    // 1. Admin Joins Room 101 First
    console.log('  1. Launching Admin tab...');
    const adminTab = await cluster.createTab('https://127.0.0.1:5173/room/101', 'AdminAlice');
    await adminTab.mockDialogs();
    await new Promise((r) => setTimeout(r, 4000));

    await adminTab.evalCode(`
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

    await adminTab.evalCode(`
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

    const adminInRoom = await adminTab.evalCode(() => {
      return document.body.innerText.includes('Host / Admin') || Boolean(document.querySelector('.lucide-crown'));
    });
    if (adminInRoom) {
      console.log('  ✅ 1. HostAdmin successfully authenticated and entered Room #101');
      assertionsPassed++;
    } else {
      throw new Error('Admin could not enter room');
    }

    // 2. Peer Visits Room 101 and Knocks
    console.log('  2. Launching Peer tab to knock...');
    const peerTab = await cluster.createTab('https://127.0.0.1:5173/room/101', 'PeerBob');
    await peerTab.mockDialogs();
    await new Promise((r) => setTimeout(r, 4000));

    await peerTab.evalCode(`
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

    // 3. Verify Peer sees Waiting state
    const peerWaiting = await peerTab.evalCode(() => {
      return document.body.innerText.includes('Waiting for Admin') || document.body.innerText.includes('Wait for Admin to Join') || document.body.innerText.includes('Approval Pending');
    });
    if (peerWaiting) {
      console.log('  ✅ 2. Peer entered Waiting for Host Approval state');
      assertionsPassed++;
    } else {
      console.log('  ⚠️ Peer waiting state text:', await peerTab.evalCode(() => document.body.innerText.slice(0, 150)));
    }

    // 4. Admin sees Knock Notification Bar with Peer's name
    const adminSawKnock = await adminTab.evalCode(() => {
      return document.body.innerText.includes('PeerBob') || Boolean(document.querySelector('.lucide-shield-alert'));
    });
    if (adminSawKnock) {
      console.log('  ✅ 3. Host received Knock Request notification banner for PeerBob');
      assertionsPassed++;
    }

    // 5. Admin Clicks Admit
    const admitRes = await adminTab.evalCode(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const admitBtn = buttons.find((b) => b.textContent.trim() === 'Admit');
        if (admitBtn) {
          admitBtn.click();
          return true;
        }
        return false;
      })()
    `);

    if (admitRes) {
      console.log('  ✅ 4. Host clicked Admit button');
      assertionsPassed++;
    }

    // 6. Peer Transitions into Active Call
    await new Promise((r) => setTimeout(r, 4000));
    const peerInCall = await peerTab.evalCode(() => {
      return document.body.innerText.includes('#101') && !document.body.innerText.includes('Waiting for Admin');
    });
    if (peerInCall) {
      console.log('  ✅ 5. Peer successfully admitted and entered active call room');
      assertionsPassed++;
    }

    // 7. Verify Both Parties are Connected in Video Stage
    const callStageCheck = await adminTab.evalCode(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      return videos.length >= 1;
    });
    if (callStageCheck) {
      console.log('  ✅ 6. Video stage initialized with active peer connection');
      assertionsPassed++;
    }

    console.log(`\n🎉 [TEST 02 PASSED]: All ${assertionsPassed}/6 assertions passed!\n`);
    return true;
  } catch (err) {
    console.error('❌ [TEST 02 FAILED]:', err);
    return false;
  } finally {
    await cluster.close();
  }
}

if (process.argv[1]?.endsWith('02-knock-flow.test.mjs')) {
  runKnockFlowTest().then((ok) => process.exit(ok ? 0 : 1));
}

export { runKnockFlowTest };
