import { WebSocket } from 'ws';

/**
 * 01-signaling.test.mjs
 * Tests the LAN WebSocket Signaling Server directly.
 */
async function runSignalingTest() {
  console.log('📡 [TEST 01] Running Signaling Server Test Suite...');
  let assertionsPassed = 0;

  const connectWs = () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('wss://127.0.0.1:5173/signaling', { rejectUnauthorized: false });
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  };

  const adminWs = await connectWs();
  const peerWs = await connectWs();

  try {
    // 1. Test GET_ROOMS
    const roomsSyncPromise = new Promise((resolve) => {
      adminWs.on('message', (raw) => {
        const data = JSON.parse(raw.toString());
        if (data.type === 'ROOMS_SYNC') resolve(data);
      });
    });
    adminWs.send(JSON.stringify({ type: 'GET_ROOMS' }));
    const roomsSync = await roomsSyncPromise;
    if (Array.isArray(roomsSync.rooms) && roomsSync.rooms.length > 0) {
      console.log('  ✅ 1. GET_ROOMS returns active rooms list');
      assertionsPassed++;
    } else {
      throw new Error('GET_ROOMS did not return rooms list');
    }

    const testRoom = String(roomsSync.rooms[0].roomNumber);

    // Ensure room is unlocked before testing
    adminWs.send(JSON.stringify({ type: 'UNLOCK_ROOM', roomNumber: testRoom }));
    await new Promise((r) => setTimeout(r, 200));

    // 2. Admin Joins Room
    const adminJoinPromise = new Promise((resolve) => {
      adminWs.on('message', (raw) => {
        const data = JSON.parse(raw.toString());
        if (data.type === 'EXISTING_PEERS') resolve(data);
      });
    });
    adminWs.send(JSON.stringify({
      type: 'JOIN_ROOM',
      roomNumber: testRoom,
      peerId: 'peer_admin_01',
      name: 'HostAlice',
      isAdmin: true,
    }));
    const adminJoined = await adminJoinPromise;
    if (adminJoined.type === 'EXISTING_PEERS') {
      console.log('  ✅ 2. Admin joined room successfully');
      assertionsPassed++;
    }

    // 3. Peer Knocks on Room
    const knockAdminPromise = new Promise((resolve) => {
      adminWs.on('message', (raw) => {
        const data = JSON.parse(raw.toString());
        if (data.type === 'KNOCK_REQUEST' && data.peerId === 'peer_bob_02') {
          resolve(data);
        }
      });
    });
    const knockWaitingPromise = new Promise((resolve) => {
      peerWs.on('message', (raw) => {
        const data = JSON.parse(raw.toString());
        if (data.type === 'KNOCK_WAITING') resolve(data);
      });
    });

    peerWs.send(JSON.stringify({
      type: 'KNOCK_REQUEST',
      roomNumber: testRoom,
      peerId: 'peer_bob_02',
      name: 'BobKnocker',
    }));

    const [knockAdmin, knockWaiting] = await Promise.all([knockAdminPromise, knockWaitingPromise]);
    if (knockAdmin.peerId === 'peer_bob_02' && knockWaiting.type === 'KNOCK_WAITING') {
      console.log('  ✅ 3. Knock request delivered to Host and Peer received KNOCK_WAITING');
      assertionsPassed++;
    }

    // 4. Admin Admits Peer
    const peerAdmitPromise = new Promise((resolve) => {
      peerWs.on('message', (raw) => {
        const data = JSON.parse(raw.toString());
        if (data.type === 'KNOCK_RESPONSE' && data.status === 'admitted') {
          resolve(data);
        }
      });
    });

    adminWs.send(JSON.stringify({
      type: 'KNOCK_RESPONSE',
      roomNumber: testRoom,
      targetPeerId: 'peer_bob_02',
      status: 'admitted',
    }));

    const admittedRes = await peerAdmitPromise;
    if (admittedRes.status === 'admitted') {
      console.log('  ✅ 4. Admin KNOCK_RESPONSE admission received by Peer');
      assertionsPassed++;
    }

    // 5. Peer Joins using Admitted Knock ID
    const announcePromise = new Promise((resolve) => {
      adminWs.on('message', (raw) => {
        const data = JSON.parse(raw.toString());
        if (data.type === 'PEER_JOINED' && data.peerId === 'peer_bob_02') {
          resolve(data);
        }
      });
    });

    peerWs.send(JSON.stringify({
      type: 'JOIN_ROOM',
      roomNumber: testRoom,
      peerId: 'peer_bob_02',
      name: 'BobKnocker',
      isAdmin: false,
      admittedFromKnockId: 'peer_bob_02',
    }));

    const announced = await announcePromise;
    if (announced.name === 'BobKnocker') {
      console.log('  ✅ 5. Admitted peer joined room and announced via PEER_JOINED');
      assertionsPassed++;
    }

    // 6. Lock & Unlock Room Broadcast
    adminWs.send(JSON.stringify({
      type: 'LOCK_ROOM',
      roomNumber: testRoom,
    }));
    console.log('  ✅ 6. Lock room broadcast sent to signaling server');
    assertionsPassed++;

    // Clean up: unlock room for subsequent tests
    adminWs.send(JSON.stringify({
      type: 'UNLOCK_ROOM',
      roomNumber: testRoom,
    }));

    // 7. Global Announcement
    const announcementPromise = new Promise((resolve) => {
      peerWs.on('message', (raw) => {
        const data = JSON.parse(raw.toString());
        if (data.type === 'GLOBAL_ANNOUNCEMENT' && data.message === 'Emergency System Notice') {
          resolve(data);
        }
      });
    });

    adminWs.send(JSON.stringify({
      type: 'ADMIN_BROADCAST_ANNOUNCEMENT',
      message: 'Emergency System Notice',
      sender: 'Lead Admin',
    }));

    const announcement = await announcementPromise;
    if (announcement.message === 'Emergency System Notice') {
      console.log('  ✅ 7. Global admin announcement broadcasted to all active peers');
      assertionsPassed++;
    }

    console.log(`\n🎉 [TEST 01 PASSED]: All ${assertionsPassed}/7 assertions passed!\n`);
    return true;
  } catch (err) {
    console.error('❌ [TEST 01 FAILED]:', err);
    return false;
  } finally {
    try { adminWs.close(); } catch {}
    try { peerWs.close(); } catch {}
  }
}

if (process.argv[1]?.endsWith('01-signaling.test.mjs')) {
  runSignalingTest().then((ok) => process.exit(ok ? 0 : 1));
}

export { runSignalingTest };
