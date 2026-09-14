# Testing Guide

This directory contains automated test suites for **VCCall**. They verify everything from backend signaling to in-browser video tracks, chat messaging, and host controls.

The tests run against real browser instances using Chrome DevTools Protocol (CDP) and simulated cameras/mics, so you don't need any real webcam hardware plugged in or heavy extra testing dependencies installed.

---

## What's in Here

```text
tests/
├── helpers/
│   └── browser-helper.mjs            # Reusable launcher for headless Chrome & CDP sessions
├── 01-signaling.test.mjs             # WebSocket server messaging, room creation & knock signals
├── 02-knock-flow.test.mjs            # Knock-to-join flow: guest knocks, host admits, guest enters
├── 03-media-streams.test.mjs         # Verifies live audio/video tracks & non-zero video resolution
├── 04-chat-and-interactions.test.mjs # Direct P2P chat messages, pinned posts, and hand raising
├── 05-admin-controls.test.mjs        # Host tools: remote mute, stop camera, lock room
├── run-all-tests.mjs                 # Master runner that executes every test suite in order
└── README.md                         # This file
```

---

## Test Suites Explained

### 1. `01-signaling.test.mjs` — WebSocket Signaling Protocol
Connects directly to the app's signaling endpoint over a native WebSocket connection without needing a browser.
- Queries available rooms with `GET_ROOMS`.
- Joins a host into the room.
- Simulates a second client requesting to enter (`KNOCK_REQUEST`).
- Checks that the host receives the knock and can respond with an admission (`KNOCK_RESPONSE`).
- Tests room lock (`LOCK_ROOM`), room unlock (`UNLOCK_ROOM`), and global broadcast announcements.

### 2. `02-knock-flow.test.mjs` — Knock-to-Join & Host Admission Flow
Launches real browser pages for both the Host and a Peer to verify the user experience.
- The host logs in with the admin password and receives the host crown badge.
- A peer opens the room link, types their name, and hits join.
- Verifies the peer enters the holding screen ("Wait for Admin to Join").
- Verifies the host sees the knock banner with the peer's name and clicks **Admit**.
- Confirms the peer's browser immediately transitions into the call room without refreshing the page.

### 3. `03-media-streams.test.mjs` — WebRTC Camera & Audio Feeds
Spins up two browser instances with simulated camera and microphone hardware (`--use-fake-device-for-media-stream`).
- Verifies both participants create active local media streams.
- Confirms both browsers receive remote media tracks that are in a `live` state.
- Inspects the `<video>` elements to make sure real frames are rendering (`videoWidth > 0` and `videoHeight > 0`).
- Validates the autoplay recovery listener.

### 4. `04-chat-and-interactions.test.mjs` — Chat, Pinned Messages & Hand Raise
Tests real-time communication over the WebRTC DataChannel.
- The peer opens the chat drawer, types a message, and sends it.
- Confirms the host's chat drawer receives and renders the message instantly.
- Checks that when the host pins a message, the pinned banner appears for the peer.
- The peer clicks **Raise Hand** (`✋`), and the test verifies the raised-hand badge and "Lower Hand" button show up on the host's screen.

### 5. `05-admin-controls.test.mjs` — Host Quick Controls
Tests host moderation actions while a call is active.
- **Remote Mute**: Host clicks mute on the participant's tile; confirms the participant's mic track gets disabled and an on-screen mute notification shows up.
- **Stop Camera**: Host disables the participant's video; confirms their camera feed cuts off.
- **Lock Room**: Host locks the call; confirms a "Room Locked" indicator appears and new connections are blocked.
- **Clean-up**: Unlocks the room when finished so future tests start with a clean slate.

---

## How to Run

### Before Running
1. Make sure the development server is running in another terminal window:
   ```bash
   npm run dev -- --host
   ```
2. Make sure you have Google Chrome installed on your machine.

### Run the Entire Test Suite
```bash
npm test
# or
node tests/run-all-tests.mjs
```

### Run a Single Test
If you are working on a specific feature, you can run just that test file:

```bash
# Signaling only
node tests/01-signaling.test.mjs

# Knock-to-join flow only
node tests/02-knock-flow.test.mjs

# Camera & microphone streams only
node tests/03-media-streams.test.mjs

# Chat and hand raising only
node tests/04-chat-and-interactions.test.mjs

# Admin controls only
node tests/05-admin-controls.test.mjs
```
