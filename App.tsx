import React, { useState } from 'react';
import SpellingAdventure from './components/SpellingAdventure';
import { MultiplayerAdventure } from './components/MultiplayerAdventure';
import { NetworkMultiplayer } from './components/NetworkMultiplayer';

type Mode = "MENU" | "SINGLE" | "MULTI" | "NETWORK";

const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>("MENU");

  if (mode === "MENU") {
    return (
      <div className="flex flex-col items-center justify-center w-full min-h-screen relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" }}>

        {/* Animated background orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1.5s" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-500/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: "0.8s" }} />
          {/* Floating particles */}
          {[...Array(12)].map((_, i) => (
            <div key={i}
              className="absolute w-1 h-1 bg-white/20 rounded-full animate-pulse"
              style={{
                left: `${10 + (i * 7.5) % 80}%`,
                top: `${15 + (i * 11) % 70}%`,
                animationDelay: `${i * 0.3}s`,
                animationDuration: `${2 + (i % 3)}s`,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 flex flex-col items-center px-6 max-w-5xl w-full">
          {/* Logo/Title */}
          <div className="mb-3 flex items-center justify-center gap-4">
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-purple-600 rounded-3xl shadow-2xl flex items-center justify-center rotate-6 hover:rotate-0 transition-transform duration-500">
                <span className="text-4xl">🔤</span>
              </div>
              <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-400 rounded-full animate-bounce flex items-center justify-center">
                <span className="text-xs">✨</span>
              </div>
            </div>
          </div>

          <h1 className="text-6xl md:text-7xl font-black text-white mb-3 tracking-tight text-center">
            Spell<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">Quest</span>
          </h1>
          <p className="text-white/50 text-lg mb-2 font-medium tracking-wide text-center">AR Spelling Adventure</p>
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/20 mb-14">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-white/70 text-sm font-bold tracking-widest uppercase">Pinch to Spell!</span>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            {/* 1 Player */}
            <button
              onClick={() => setMode("SINGLE")}
              className="group relative bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-400/50 rounded-3xl p-8 flex flex-col items-center gap-5 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/20 active:scale-95 text-left"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-700 rounded-2xl shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <span className="text-3xl">👤</span>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-black text-white mb-1">Solo Play</h2>
                <p className="text-white/40 text-sm leading-relaxed">Use your hand to grab and spell words before time runs out</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                <span className="text-xs bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full font-bold border border-blue-500/30">Hand Tracking</span>
                <span className="text-xs bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full font-bold border border-blue-500/30">4 Categories</span>
              </div>
              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white/40 text-sm">▶</span>
              </div>
            </button>

            {/* 2 Players Local */}
            <button
              onClick={() => setMode("MULTI")}
              className="group relative bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-400/50 rounded-3xl p-8 flex flex-col items-center gap-5 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20 active:scale-95 text-left"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-purple-700 rounded-2xl shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <span className="text-3xl">👥</span>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-black text-white mb-1">Local 2P</h2>
                <p className="text-white/40 text-sm leading-relaxed">Race a friend on the same screen — each hand controls one player</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                <span className="text-xs bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full font-bold border border-purple-500/30">2 Hands</span>
                <span className="text-xs bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full font-bold border border-purple-500/30">Head-to-Head</span>
              </div>
              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white/40 text-sm">▶</span>
              </div>
            </button>

            {/* Online Battle */}
            <button
              onClick={() => setMode("NETWORK")}
              className="group relative bg-white/5 hover:bg-white/10 border border-white/10 hover:border-pink-400/50 rounded-3xl p-8 flex flex-col items-center gap-5 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-pink-500/20 active:scale-95 text-left"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-pink-400 to-indigo-600 rounded-2xl shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <span className="text-3xl">🌐</span>
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-black text-white mb-1">Online Battle</h2>
                <p className="text-white/40 text-sm leading-relaxed">Challenge a friend on another device with a shareable room code</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                <span className="text-xs bg-pink-500/20 text-pink-300 px-3 py-1 rounded-full font-bold border border-pink-500/30">P2P Network</span>
                <span className="text-xs bg-pink-500/20 text-pink-300 px-3 py-1 rounded-full font-bold border border-pink-500/30">Room Codes</span>
              </div>
              <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white/40 text-sm">▶</span>
              </div>
            </button>
          </div>

          {/* Footer */}
          <p className="mt-12 text-white/20 text-xs font-medium tracking-widest uppercase">
            AR-powered · Hand gestures · No controller needed
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      {mode === "SINGLE" && <SpellingAdventure />}
      {mode === "MULTI" && <MultiplayerAdventure />}
      {mode === "NETWORK" && <NetworkMultiplayer />}

      {/* Exit Game — fixed position, safe from overlap with game headers */}
      <div className="fixed top-4 right-4 z-[100]">
        <button
          className="bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-full shadow-xl font-bold text-sm transition-all hover:scale-105 active:scale-95 border-2 border-red-400/50 backdrop-blur-sm"
          onClick={() => setMode("MENU")}
        >
          ✕ Exit Game
        </button>
      </div>
    </div>
  );
};

export default App;
