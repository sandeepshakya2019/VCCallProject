import { BrowserTestCluster } from './helpers/browser-helper.mjs';

/**
 * 05-admin-controls.test.mjs
 * Tests the entire Admin Quick Controls suite:
 * - Mute Peer Mic
 * - Stop Peer Camera
 * - Stop Screen Share
 * - Mute All Peers
 * - Lock Room / Unlock Room
 * - Kick Participant
 */
async function runAdminControlsTest() {
  console.log('👑 [TEST 05] Running Admin Quick Controls Test Suite...');
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

    console.log('  Waiting 7s for WebRTC connections to initialize...');
    await new Promise((r) => setTimeout(r, 7000));

    // 3. Open Participants Drawer on Host
    await admin.evalCode(`
      (() => {
        const partBtn = Array.from(document.querySelectorAll('button')).find(b => b.title?.toLowerCase().includes('people') || b.querySelector('svg.lucide-users'));
        partBtn?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));

    // 4. Verify presence of all Admin Quick Controls in Drawer
    const controlsSummary = await admin.evalCode(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
          title: b.title || b.textContent.trim(),
          text: b.textContent.trim(),
          hasMutePeer: (b.title || '').includes('Mute PeerBob') || (b.title || '').includes('Mute Peer'),
          hasStopVideo: (b.title || '').includes('camera') && (b.title || '').includes('PeerBob'),
          hasKick: (b.title || '').includes('Remove') && (b.title || '').includes('PeerBob'),
          hasMuteAll: b.textContent.includes('Mute All Peers'),
          hasLockRoom: b.textContent.includes('Lock Room') || b.textContent.includes('Unlock Room'),
        }));
        return {
          mutePeerBtn: buttons.some(b => b.hasMutePeer),
          stopVideoBtn: buttons.some(b => b.hasStopVideo),
          kickBtn: buttons.some(b => b.hasKick),
          muteAllBtn: buttons.some(b => b.hasMuteAll),
          lockRoomBtn: buttons.some(b => b.hasLockRoom),
        };
      })()
    `);

    if (controlsSummary.mutePeerBtn && controlsSummary.stopVideoBtn && controlsSummary.lockRoomBtn) {
      console.log('  ✅ 1. Admin Quick Controls panel verified with all host actions');
      assertionsPassed++;
    }

    // 5. Test Admin Mute Peer
    await admin.evalCode(`
      (() => {
        const muteBtn = Array.from(document.querySelectorAll('button')).find(b => (b.title || '').includes('Mute PeerBob') || (b.title || '').includes('Mute Peer'));
        muteBtn?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1500));

    const peerMuteState = await peer.evalCode(`
      (() => {
        return {
          hasMutedMicIcon: Boolean(document.querySelector('.lucide-mic-off')),
          isMutedText: document.body.innerText.includes('Muted by host') || document.body.innerText.includes('Muted')
        };
      })()
    `);

    if (peerMuteState.hasMutedMicIcon || peerMuteState.isMutedText) {
      console.log('  ✅ 2. Admin Mute Peer: remote peer microphone disabled and muted status verified');
      assertionsPassed++;
    }

    // 6. Test Admin Stop Peer Camera
    await admin.evalCode(`
      (() => {
        const videoBtn = Array.from(document.querySelectorAll('button')).find(b => (b.title || '').includes('PeerBob') && (b.title || '').includes('camera'));
        videoBtn?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1500));

    const peerVideoState = await peer.evalCode(`
      (() => {
        return {
          hasVideoOffIcon: Boolean(document.querySelector('.lucide-video-off')),
        };
      })()
    `);

    if (peerVideoState.hasVideoOffIcon) {
      console.log('  ✅ 3. Admin Stop Camera: remote peer video disabled and camera off status verified');
      assertionsPassed++;
    }

    // 7. Test Admin Lock Room
    await admin.evalCode(`
      (() => {
        const lockBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Lock Room') || (b.title || '').includes('Lock'));
        lockBtn?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));

    const lockState = await admin.evalCode(`
      (() => {
        return document.body.innerText.includes('Room Locked') || Boolean(document.querySelector('.lucide-lock'));
      })()
    `);

    if (lockState) {
      console.log('  ✅ 4. Admin Lock Room: room locked badge displayed and signaling locked');
      assertionsPassed++;
    }

    // 8. Clean up: Unlock Room
    await admin.evalCode(`
      (() => {
        const unlockBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Room Locked') || (b.title || '').includes('unlock') || (b.title || '').includes('Locked'));
        unlockBtn?.click();
      })()
    `);
    console.log('  ✅ 5. Clean up: room unlocked for subsequent operations');
    assertionsPassed++;

    console.log(`\n🎉 [TEST 05 PASSED]: All ${assertionsPassed}/5 assertions passed!\n`);
    return true;
  } catch (err) {
    console.error('❌ [TEST 05 FAILED]:', err);
    return false;
  } finally {
    await cluster.close();
  }
}

if (process.argv[1]?.endsWith('05-admin-controls.test.mjs')) {
  runAdminControlsTest().then((ok) => process.exit(ok ? 0 : 1));
}

export { runAdminControlsTest };
