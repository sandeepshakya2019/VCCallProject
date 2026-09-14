import { runSignalingTest } from './01-signaling.test.mjs';
import { runKnockFlowTest } from './02-knock-flow.test.mjs';
import { runMediaStreamsTest } from './03-media-streams.test.mjs';
import { runChatAndInteractionsTest } from './04-chat-and-interactions.test.mjs';
import { runAdminControlsTest } from './05-admin-controls.test.mjs';

/**
 * run-all-tests.mjs
 * Master test runner executing all VC Call test suites sequentially.
 */
async function main() {
  console.log('===============================================================');
  console.log('       VC CALL (LAN WebRTC) - AUTOMATED TEST RUNNER');
  console.log('===============================================================');
  console.log(`Started at: ${new Date().toLocaleString()}\n`);

  const startTime = Date.now();
  const suites = [
    { name: '01: WebSocket Signaling & Protocols', runner: runSignalingTest },
    { name: '02: Knock-to-Join & Host Admission', runner: runKnockFlowTest },
    { name: '03: WebRTC Media & Audio Tracks', runner: runMediaStreamsTest },
    { name: '04: P2P Live Chat & Interactions', runner: runChatAndInteractionsTest },
    { name: '05: Admin Panel Quick Controls', runner: runAdminControlsTest },
  ];

  const results = [];

  for (const suite of suites) {
    const sStart = Date.now();
    try {
      console.log(`\n▶ Starting Suite: ${suite.name}...`);
      const passed = await suite.runner();
      const duration = ((Date.now() - sStart) / 1000).toFixed(1);
      results.push({ name: suite.name, passed: Boolean(passed), duration: `${duration}s` });
    } catch (err) {
      const duration = ((Date.now() - sStart) / 1000).toFixed(1);
      console.error(`Suite ${suite.name} encountered uncaught error:`, err);
      results.push({ name: suite.name, passed: false, duration: `${duration}s`, error: err.message });
    }
    // Give 2 seconds for process and socket cleanup between suites
    await new Promise((r) => setTimeout(r, 2000));
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n===============================================================');
  console.log('                     TEST RUN SUMMARY');
  console.log('===============================================================');
  results.forEach((r, idx) => {
    const badge = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(` ${idx + 1}. [${badge}] ${r.name.padEnd(42)} (${r.duration})`);
  });
  console.log('---------------------------------------------------------------');
  const allPassed = results.every((r) => r.passed);
  console.log(`Total Suites: ${results.length} | Passed: ${results.filter((r) => r.passed).length} | Failed: ${results.filter((r) => !r.passed).length}`);
  console.log(`Elapsed Time: ${totalDuration}s`);
  console.log('===============================================================\n');

  if (allPassed) {
    console.log('🎉 ALL TEST SUITES PASSED CLEANLY!\n');
    process.exit(0);
  } else {
    console.error('⚠️ SOME TEST SUITES FAILED. Check logs above.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
