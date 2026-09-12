# 📹 VCCall — Secure Local Network (LAN) Video Conferencing

A modern, professional **Peer-to-Peer (P2P) Video Conferencing & Real-Time Collaboration** web application tailored for **Local Area Networks (LAN)**. Built with **React 19**, **Vite**, **Tailwind CSS**, and **WebRTC (PeerJS)** with **zero server storage**.

---

## 🌐 Why Local Network (LAN) Video Calling?

Most video conferencing tools (Zoom, Google Meet, Microsoft Teams) route all audio, video, and screen data through external cloud servers across the public internet. This causes major drawbacks in localized environments:

1. **Zero External Internet Consumption**: 
   Video and audio streams flow strictly across your local Wi-Fi or Ethernet switch. Multiple high-definition streams won't congest your office or home internet connection.
2. **Ultra-Low Latency & High Fidelity**:
   Packets stay within your local subnet, delivering sub-millisecond network hops, minimal lag, and crisp HD video and clear audio.
3. **100% Private, Secure & Ephemeral**:
   Streams are encrypted peer-to-peer using **DTLS-SRTP**. Media and chat messages never touch a third-party server or cloud database. What happens in the room stays strictly between the participants.
4. **Works in Air-Gapped & Offline Environments**:
   Perfect for corporate intranets, hospitals, universities, secure research facilities, disaster relief sites, construction trailers, cruise ships, or remote field offices where internet connectivity is restricted, expensive, or entirely offline.

---

## ✨ Features

- 🎥 **Peer-to-Peer HD Video & Audio**: Crystal-clear multi-peer mesh video calling directly between browsers.
- 🔒 **Host Approval & Waiting Room ("Knock" Feature)**:
  - Rooms configured with *"Ask Before Join"* require guest approval.
  - Guests wait in a sleek waiting room until the host/admin enters and clicks **Admit**.
- 🛡️ **Protected Admin Panel (`/admin`)**:
  - Authenticated via secure password from `.env` (`VITE_ADMIN_PASSWORD`).
  - **Create Rooms**: Define custom room numbers, names, and access rules.
  - **Live Permission Controls**: Dynamically toggle Camera, Microphone, Screen Sharing, Text Chat, or Lock the room in real time.
  - **Room Deletion**: Safely tear down rooms and notify/disconnect participants.
- 💬 **Encrypted P2P Live Chat**: Ephemeral real-time chat running over WebRTC data channels with zero server storage.
- 🖥️ **Screen Sharing**: One-click display and tab sharing on supported desktop browsers.
- 📱 **Fully Mobile Responsive**:
  - Adaptive Dynamic Viewport (`100dvh`) preventing mobile URL bar clipping.
  - Ergonomic touch dock controls.
  - Full-screen mobile chat overlay drawer with easy one-tap dismissal.
  - Auto-zoom prevention on iOS Safari inputs.
- 🔐 **Out-of-the-box HTTPS**: Built-in SSL via `@vitejs/plugin-basic-ssl` ensuring modern mobile browsers (iOS Safari, Android Chrome) permit camera and microphone access on local IP addresses.
- 📋 **1-Click Network & Invite Links**: Easy copy buttons for local network URLs and direct room invites.

---

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/), [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/), [Lucide React Icons](https://lucide.dev/)
- **Real-Time Communication**: [WebRTC](https://webrtc.org/), [PeerJS](https://peerjs.com/)
- **Local Signaling**: Built-in Vite WebSocket signaling for mesh coordination & knock notifications
- **SSL / Security**: `@vitejs/plugin-basic-ssl` for self-signed HTTPS on local network IPs

---

## 🚀 Quick Start & Installation

### 1. Prerequisites
- **Node.js** (v18.0.0 or higher recommended)
- **npm** (comes bundled with Node.js)

### 2. Clone the Repository
```bash
git clone https://github.com/your-username/vccall.git
cd vccall
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables (`.env`)
Create or edit the `.env` file in the root directory:

```env
# Admin Panel & Host Password
VITE_ADMIN_PASSWORD=admin123

# Your machine's Local Network IP (e.g., 192.168.1.X or 10.X.X.X)
VITE_APP_IP=10.12.191.153
```

> **How to find your local IP**:
> - **Windows**: Open PowerShell or CMD and run `ipconfig` (look for *IPv4 Address* under your Wi-Fi or Ethernet adapter).
> - **macOS / Linux**: Run `ifconfig` or `ip a` (look for `inet` under `en0`, `wlan0`, or `eth0`).

---

## 🏃 Running the Application

### Start the Local HTTPS Server
```bash
npm run dev -- --host
```

Vite will start the server and bind to all network interfaces:
```
  ➜  Local:   https://localhost:5173/
  ➜  Network: https://10.12.191.153:5173/
```

### Connecting from Mobile Devices / Other Laptops
1. Connect your phone or second device to the **same Wi-Fi network**.
2. Open your mobile browser (Safari on iOS, Chrome on Android).
3. Navigate to the Network URL shown on your screen (e.g., `https://10.12.191.153:5173`).
4. **Bypass the Self-Signed Certificate Warning**:
   - Because the app runs locally with a development SSL certificate, the browser will show a standard warning:
     - **Chrome / Android**: Tap **Advanced** ➜ **Proceed to 10.12.191.153 (unsafe)**.
     - **Safari / iOS**: Tap **Show Details** ➜ **visit this website** ➜ confirm **Visit Website**.
5. Allow camera and microphone permissions when prompted.

---

## 📖 How to Use

### 1. Joining a Video Call as a Participant
1. Open the home page (`https://<your-ip>:5173/`).
2. Enter any configured Room Number (e.g. `101`, `102`) and click **Connect to Room**.
3. In the pre-join preview, enter your display name and check your camera/mic.
4. Click **Join Room**. If the host has enabled *"Ask Before Join"*, you will wait until the host admits you.

### 2. Joining as Room Host / Admin
1. Go to the room URL (e.g. `https://<your-ip>:5173/room/101`).
2. Check the **"Join as Room Admin / Host"** checkbox.
3. Enter your admin password (configured in `.env`).
4. You will join with the 👑 **Host / Admin** badge and will be able to review and admit pending guest requests.

### 3. Managing Rooms in the Admin Panel (`/admin`)
1. Navigate to `https://<your-ip>:5173/admin`.
2. Enter the admin password.
3. **Create Rooms**: Specify a room number, friendly name, and default permissions.
4. **Edit Permissions Live**: Instantly toggle Chat, Screen Sharing, Video, Audio, or Lock the room.
5. **Delete Rooms**: Terminate the session and automatically eject all connected peers back to the lobby.

---

## 📦 Building for Production

To create an optimized production build:

```bash
npm run build
```

Preview the production build locally:
```bash
npm run preview -- --host
```

---

## 🔒 Security & Privacy Notice

- **No Data Collection**: No cookies, tracking scripts, or analytics are included.
- **Local Network Isolation**: No media or signaling traffic leaves your local area network unless you explicitly configure an external STUN/TURN server.
- **Encrypted WebRTC**: Audio, video, and data channels are encrypted end-to-end via WebRTC standards (DTLS/SRTP).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE). Feel free to use, modify, and distribute it for private, organizational, or commercial use.
