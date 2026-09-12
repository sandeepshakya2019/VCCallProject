# VC Call - Professional Video Calling & URL Rooms

A modern, professional Peer-to-Peer Video Calling and Live Chat web application built with **React 19**, **Vite**, **Tailwind CSS**, and **PeerJS (WebRTC)** with **zero server storage required**.

---

## Key Highlights

- 🎨 **Professional Tailwind CSS UI**: Dark-mode glassmorphism design (`slate-950`, `indigo-600`, `emerald-500`) with smooth animations and responsive layout.
- 🔗 **URL-Based Room Joining**: Connect to any room via URL: `http://localhost:5173/room/<roomNumber>` (e.g. `/room/101`). Anyone entering or typing the same room number connects into that room!
- 🛡️ **Protected Admin Panel (`/admin`)**:
  - Secured by a password stored in `.env` (`VITE_ADMIN_PASSWORD`).
  - **Create Rooms**: Specify room number, room name, and initial permissions.
  - **Live Permission Controls**: Toggle **Chat**, **Screen Sharing**, **Camera**, **Microphone**, and **Room Locking** on/off for any room at any time.
  - **Delete Rooms**: Instantly terminates the room and notifies/ejects participants.
  - **Share Links**: 1-click button to copy direct invite links for any room.
- 💬 **Live P2P Text Chat**: Ephemeral chat running directly over WebRTC Data Channels (never stored on any server).
- 🎥 **Call Controls**: Mute/Unmute Mic, Camera On/Off, Screen Sharing, Live Chat toggle with unread badge, and Leave Call.

---

## Setup & Configuration

### 1. Environment Variables (`.env`)
The Admin Panel password is configured in `.env`:
```env
VITE_ADMIN_PASSWORD=admin123
```
You can change this password to whatever you like.

### 2. Start the Dev Server
```bash
npm run dev
```

Vite will bind to all network interfaces (`0.0.0.0`):
```
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://<your-ip>:5173/
```

---

## How to Use

### 1. Joining via Room Number
- Open [http://localhost:5173](http://localhost:5173).
- Test your camera and microphone in the preview card.
- Enter any room number (e.g. `101`) and click **"Connect to Room"**.
- Alternatively, go directly to: [http://localhost:5173/room/101](http://localhost:5173/room/101).
- Anyone opening the same room number will connect to the same video call and live chat!

### 2. Admin Panel
- Navigate to [http://localhost:5173/admin](http://localhost:5173/admin).
- Enter the admin password configured in `.env` (default: `admin123`).
- **Create a Room**: Click **"+ Create New Room"**, enter the room number and choose allowed features (allow chat, allow screen share, lock room, etc.).
- **Edit Permissions**: Click **"Edit Permissions"** on any room to instantly toggle features like disabling chat or screen sharing.
- **Delete Room**: Click the trash icon to close the room and disconnect participants.
