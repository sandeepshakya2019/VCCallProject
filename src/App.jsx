import React from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { RoomProvider } from './context/RoomContext';
import Navbar from './components/Navbar';
import LobbyPage from './pages/LobbyPage';
import RoomPage from './pages/RoomPage';
import AdminPage from './pages/AdminPage';

// Wrapper to extract currentRoomNumber for Navbar
function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      <Routes>
        <Route
          path="/"
          element={
            <>
              <Navbar />
              <main className="flex-1">
                <LobbyPage />
              </main>
            </>
          }
        />
        <Route
          path="/room/:roomNumber"
          element={<RoomRouteWrapper />}
        />
        <Route
          path="/admin"
          element={
            <>
              <Navbar />
              <main className="flex-1">
                <AdminPage />
              </main>
            </>
          }
        />
        {/* Fallback to lobby */}
        <Route
          path="*"
          element={
            <>
              <Navbar />
              <main className="flex-1">
                <LobbyPage />
              </main>
            </>
          }
        />
      </Routes>
    </div>
  );
}

function RoomRouteWrapper() {
  const { roomNumber } = useParams();
  return (
    <>
      <Navbar currentRoomNumber={roomNumber} />
      <main className="flex-1 overflow-hidden">
        <RoomPage />
      </main>
    </>
  );
}

export default function App() {
  return (
    <RoomProvider>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </RoomProvider>
  );
}
