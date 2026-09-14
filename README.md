# VCCall — Private Local Network (LAN) Video Calls

A lightweight, peer-to-peer video calling app built specifically for local Wi-Fi and office networks. It connects devices directly to each other without routing any video, audio, or chat data through the public internet.

Built with **React 19**, **Vite**, **Tailwind CSS**, and **WebRTC (PeerJS)**. Everything runs locally on your own network with zero server storage.

---

## Screenshots

| Room Lobby | Audio / Video Check |
|:---:|:---:|
| ![Call Lobby](docs/screenshots/01-lobby.png) | ![Pre-Join Preview](docs/screenshots/02-prejoin-preview.png) |
| *Pick or enter a room number, preview your camera, and copy invite links.* | *Check your mic and webcam before stepping into the call.* |

| Inside the Call | Chat & Meeting Notes |
|:---:|:---:|
| ![Active Video Call](docs/screenshots/04-active-call.png) | ![In-Call Chat Drawer](docs/screenshots/05-chat-and-collaboration.png) |
| *Active speaker glow, floating control bar, local recording, and room lock.* | *Direct encrypted chat, emoji reactions, and live collaborative agenda notes.* |

### Host & Admin Dashboard
![Admin Dashboard](docs/screenshots/03-admin-dashboard.png)
*Manage active rooms, change permissions on the fly, lock rooms, or send announcements across the network.*

---

## Why use this over Zoom or Google Meet?

If you are on the same Wi-Fi or office network, sending your camera and microphone out to cloud servers and back is unnecessary and wastes bandwidth. 

- **Saves Your Internet Bandwidth**: High-definition video and audio travel straight through your local router or switch. You can run multi-person video calls without slowing down your home or office internet.
- **Near-Zero Latency**: Because streams don't travel across internet servers, lag is virtually non-existent.
- **Completely Private**: Video, voice, and text messages stay between the connected computers. Nothing is saved to a cloud server or external database.
- **Works Without Internet (Offline / Air-Gapped)**: As long as devices share the same local router, switch, or hotspot, you can make calls even if your internet connection is down. Useful for remote sites, schools, hospitals, construction sites, and labs.

---

## What you can do with it

### Video & Audio
- **Direct Peer-to-Peer**: Browsers link up directly with WebRTC.
- **Active Speaker Border**: The person currently talking gets highlighted with a border.
- **Pin Any Screen or Person**: Double-click any participant or screen share (or hit `P`) to focus on them full-size.
- **Picture-in-Picture**: Keep an eye on the call in a small floating corner window while looking through documents or notes.
- **Low Bandwidth Toggle**: When Wi-Fi is shaky, turn on low bandwidth mode to drop video resolution and save your audio clarity.
- **Soft Audio Cues**: Pleasant chimes play when someone joins, leaves, knocks, or raises a hand.

### Waiting Room & Host Moderation ("Knock to Join")
- **Knock Queue**: If a room is set to private, guests wait in a clean waiting lobby until a host lets them in.
- **Admit or Decline**: Hosts get an instant popup banner to admit or reject guests with one click.
- **Lock Room**: Hosts can lock the door at any point so no one else can join.
- **Moderator Actions**: Mute noisy microphones, turn off problematic cameras, or remove a participant from the call.

### Chat & Live Tools
- **P2P Chat**: Direct text messaging with unread count badges.
- **Pinned Messages**: Keep important links, wifi passwords, or notes stuck to the top of the chat panel.
- **Hand Raising (✋)**: Hit hand raise to grab attention politely without speaking over someone.
- **Shared Meeting Agenda**: Real-time scratchpad where everyone can read and edit meeting notes together.
- **Group Snapshot**: Take a one-click picture of everyone in the call with a clean timestamp watermark.

### Meeting Summary & Recording
- **Local Recording**: Record your meeting locally into a `.webm` video file straight from your browser. No subscription, no watermarks, no server limits.
- **Meeting Summary Download**: Grab a `.txt` report of attendance (who joined and left when), notes taken, and chat transcripts.
- **Network Stats**: Built-in modal to check your live ping (RTT), packet loss, and video resolution.

### Admin Dashboard (`/admin`)
- Create and name custom rooms (e.g. `101`, `Design Sync`, `Boardroom`).
- Turn camera, mic, screen share, or chat permissions on or off for the whole room.
- Broadcast an announcement banner to every active room across your local network.

---

## Keyboard Shortcuts

| Key | Action |
|:---:|:---|
| **M** | Mute or unmute microphone |
| **V** | Turn camera on or off |
| **O** | Mute outgoing audio (deafen) |
| **C** | Open / close chat panel |
| **P** | Open / close participants panel |
| **H** | Raise or lower your hand (✋) |
| **S** | Capture a group snapshot |
| **F** | Toggle fullscreen |
| **?** | Show keyboard shortcuts |
| **Esc** | Close popups and drawers |

---

## Quick Start Guide

### What you need
- **Node.js** (version 18 or higher)
- **npm** (comes with Node.js)
- A modern browser (Chrome, Edge, Safari, Brave, Firefox)

### 1. Clone and Install
```bash
git clone https://github.com/your-username/vccall.git
cd vccall
npm install
```

### 2. Set Up Your Environment File (`.env`)
Make a `.env` file in the main folder (or copy `.env.example` if available):

```env
# Password for the admin panel and host login
VITE_ADMIN_PASSWORD=admin123

# Your computer's IP address on the local network (e.g., 192.168.1.50 or 10.0.0.15)
VITE_APP_IP=10.12.191.153
```

> **How to find your local IP address:**
> - **Windows**: Run `ipconfig` in Command Prompt / PowerShell and look for **IPv4 Address**.
> - **Mac / Linux**: Run `ifconfig` or `ip a` and check the `inet` line under `en0` or `wlan0`.

### 3. Start the Server
```bash
npm run dev -- --host
```

Once running, Vite will print your addresses:
```text
  ➜  Local:   https://localhost:5173/
  ➜  Network: https://10.12.191.153:5173/
```

### 4. Opening from a Phone or Another Laptop
1. Connect your second device to the **exact same Wi-Fi**.
2. Open the browser on that device and visit the **Network URL** (for example: `https://10.12.191.153:5173`).
3. **Accept the SSL Warning**:
   Because the site runs on your local network using a self-generated development certificate, your browser will ask if you trust the page:
   - On Chrome / Android: Click **Advanced** ➜ **Proceed to ... (unsafe)**.
   - On Safari / iPhone: Click **Show Details** ➜ **visit this website** ➜ **Visit Website**.
4. Allow camera and microphone permissions, and you're good to go!

---

## Automated Testing Suite

The repository includes a set of automated tests that check signaling, knock-to-join, video/audio tracks, chat, and host controls using headless Chrome with simulated media devices:

```bash
# Run all tests together
npm test

# Or run individual tests
npm run test:signaling   # Tests room discovery and WebSocket signaling
npm run test:knock       # Tests the knock-to-join and host admission flow
npm run test:media       # Tests WebRTC audio and video track delivery
npm run test:chat        # Tests peer-to-peer data chat and hand raising
npm run test:admin       # Tests admin mute, camera stop, and room lock
```

See [`tests/README.md`](tests/README.md) for full details on the test architecture.

---

## Building for Production

To create an optimized production build:

```bash
npm run build
npm run preview -- --host
```

---

## Privacy & Security

- **No Analytics / Telemetry**: No third-party trackers, external fonts, or analytics cookies.
- **Encrypted Local Traffic**: Media and data streams use standard WebRTC encryption (DTLS and SRTP).
- **Stays on Your Network**: Your video, audio, and chat packets stay inside your local router unless you configure external STUN/TURN servers.

---

## License

MIT License. Free to use, adapt, and build on for personal, school, or business projects.
