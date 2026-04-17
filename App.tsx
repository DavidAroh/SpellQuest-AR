import React, { useState } from 'react';
import SpellingAdventure from './components/SpellingAdventure';
import { MultiplayerAdventure } from './components/MultiplayerAdventure';
import { NetworkMultiplayer } from './components/NetworkMultiplayer';

type Mode = "MENU" | "SINGLE" | "MULTI" | "NETWORK";

const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>("MENU");

  // ── Design tokens ────────────────────────────────────────────────────────
  const T = {
    void:      '#08080d',
    amber:     '#f5a623',
    amberDim:  'rgba(245,166,35,0.10)',
    amberGlow: 'rgba(245,166,35,0.30)',
    surface:   'rgba(255,255,255,0.032)',
    border:    'rgba(255,255,255,0.07)',
    textPrimary: '#f0ece3',
    textMuted:   'rgba(240,236,227,0.38)',
  };

  const cards = [
    {
      id: 'solo', mode: 'SINGLE' as Mode,
      icon: '◈', label: 'Solo Play',
      sub: 'Use your hand to grab and spell words before time runs out',
      tags: ['Hand Tracking', '4 Categories'],
      accent: '#38bdf8',
      accentDim: 'rgba(56,189,248,0.10)',
      accentGlow: 'rgba(56,189,248,0.22)',
      delay: '0ms',
    },
    {
      id: 'local', mode: 'MULTI' as Mode,
      icon: '◑', label: 'Local 2P',
      sub: 'Race a friend on the same screen — each hand controls one player',
      tags: ['2 Hands', 'Head-to-Head'],
      accent: '#c084fc',
      accentDim: 'rgba(192,132,252,0.10)',
      accentGlow: 'rgba(192,132,252,0.22)',
      delay: '90ms',
    },
    {
      id: 'online', mode: 'NETWORK' as Mode,
      icon: '◉', label: 'Online Battle',
      sub: 'Challenge a friend on another device with a shareable room code',
      tags: ['P2P Network', 'Room Codes'],
      accent: T.amber,
      accentDim: T.amberDim,
      accentGlow: T.amberGlow,
      delay: '180ms',
    },
  ] as const;

  if (mode === "MENU") {
    return (
      <div style={{
        minHeight: '100dvh', width: '100%',
        background: T.void,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
        fontFamily: "'DM Sans', sans-serif",
      }}>

        {/* ── Keyframes ── */}
        <style>{`
          @keyframes sq-drift {
            0%,100% { transform: translate(0,0); }
            50%      { transform: translate(9px,-18px); }
          }
          @keyframes sq-fadein {
            from { opacity:0; transform:translateY(24px); }
            to   { opacity:1; transform:translateY(0); }
          }
          @keyframes sq-glowpulse {
            0%,100% { opacity:.5; } 50% { opacity:1; }
          }
          @keyframes sq-scanline {
            0%   { transform:translateY(-100%); }
            100% { transform:translateY(100vh); }
          }
          .sq-card { opacity:0; animation:sq-fadein .65s cubic-bezier(.22,1,.36,1) forwards; }
          .sq-card-inner { transition:transform .35s cubic-bezier(.22,1,.36,1); }
          .sq-card:hover .sq-card-inner { transform:translateY(-6px); }
          .sq-arrow { opacity:0; transform:translateX(-4px); transition:opacity .2s,transform .25s; }
          .sq-card:hover .sq-arrow { opacity:1; transform:translateX(4px); }
          .sq-wm  { opacity:0; animation:sq-fadein .7s  .05s cubic-bezier(.22,1,.36,1) forwards; }
          .sq-sub { opacity:0; animation:sq-fadein .7s  .22s cubic-bezier(.22,1,.36,1) forwards; }
          .sq-pill{ opacity:0; animation:sq-fadein .6s  .38s cubic-bezier(.22,1,.36,1) forwards; }
          .sq-ft  { opacity:0; animation:sq-fadein .6s  .52s cubic-bezier(.22,1,.36,1) forwards; }
        `}</style>

        {/* ── Ambient blobs ── */}
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden' }}>
          <div style={{
            position:'absolute', top:'-15%', left:'-10%',
            width:'55vw', height:'55vw', maxWidth:680, maxHeight:680,
            borderRadius:'50%',
            background:'radial-gradient(circle,rgba(56,189,248,.07) 0%,transparent 70%)',
            animation:'sq-drift 12s ease-in-out infinite',
          }}/>
          <div style={{
            position:'absolute', bottom:'-20%', right:'-10%',
            width:'60vw', height:'60vw', maxWidth:750, maxHeight:750,
            borderRadius:'50%',
            background:'radial-gradient(circle,rgba(245,166,35,.07) 0%,transparent 68%)',
            animation:'sq-drift 16s ease-in-out infinite reverse',
          }}/>
          {/* Faint midline grid rule */}
          <div style={{
            position:'absolute', top:'50%', left:0, right:0, height:1,
            background:'linear-gradient(90deg,transparent,rgba(255,255,255,.04) 30%,rgba(255,255,255,.04) 70%,transparent)',
          }}/>
          {/* Scanline sweep */}
          <div style={{
            position:'absolute', left:0, right:0, height:120,
            background:'linear-gradient(180deg,transparent,rgba(255,255,255,.012),transparent)',
            animation:'sq-scanline 8s linear infinite',
            pointerEvents:'none',
          }}/>
        </div>

        {/* ── Main content ── */}
        <div style={{
          position:'relative', zIndex:10,
          display:'flex', flexDirection:'column', alignItems:'center',
          width:'100%', maxWidth:1100,
          padding:'0 clamp(1.25rem,5vw,3rem)',
        }}>

          {/* Live pill */}
          <div className="sq-pill" style={{
            display:'flex', alignItems:'center', gap:8,
            background:'rgba(245,166,35,0.08)',
            border:'1px solid rgba(245,166,35,0.2)',
            borderRadius:999, padding:'6px 18px',
            marginBottom:'1.5rem',
          }}>
            <span style={{
              width:7, height:7, borderRadius:'50%',
              background:T.amber, boxShadow:`0 0 8px ${T.amberGlow}`,
              display:'inline-block',
              animation:'sq-glowpulse 2s ease-in-out infinite',
            }}/>
            <span style={{
              fontFamily:"'DM Sans',sans-serif",
              fontSize:'0.7rem', fontWeight:600,
              letterSpacing:'0.28em', textTransform:'uppercase',
              color:T.amber,
            }}>Pinch to Spell</span>
          </div>

          {/* Wordmark */}
          <h1 className="sq-wm" style={{
            fontFamily:"'Bebas Neue',cursive",
            fontSize:'clamp(4.5rem,13vw,9.5rem)',
            lineHeight:.92, letterSpacing:'0.04em',
            color:T.textPrimary,
            margin:0, marginBottom:'0.15em',
            textAlign:'center', userSelect:'none',
          }}>
            Spell<span style={{
              color:T.amber,
              textShadow:`0 0 50px ${T.amberGlow},0 0 100px ${T.amberDim}`,
            }}>Quest</span>
          </h1>

          <p className="sq-sub" style={{
            fontFamily:"'DM Sans',sans-serif",
            fontSize:'clamp(.75rem,1.5vw,.9rem)',
            fontWeight:300, letterSpacing:'0.35em',
            textTransform:'uppercase', color:T.textMuted,
            marginTop:0, marginBottom:'clamp(2.5rem,6vw,4rem)',
          }}>AR · Spelling Adventure</p>

          {/* ── Mode cards ── */}
          <div style={{
            display:'grid',
            gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',
            gap:'clamp(1rem,2.5vw,1.5rem)',
            width:'100%',
          }}>
            {cards.map(card => (
              <button
                key={card.id}
                id={`mode-${card.id}`}
                className="sq-card"
                onClick={() => setMode(card.mode)}
                style={{
                  animationDelay: card.delay,
                  background:'none', border:'none',
                  padding:0, cursor:'pointer', textAlign:'left',
                  ['--sq-adim' as string]: card.accentDim,
                }}
              >
                <div className="sq-card-inner" style={{
                  background:T.surface,
                  border:`1px solid ${T.border}`,
                  borderRadius:20,
                  padding:'clamp(1.5rem,3vw,2rem)',
                  display:'flex', flexDirection:'column',
                  gap:'1.25rem', height:'100%',
                  position:'relative', overflow:'hidden',
                }}>
                  {/* Top accent line */}
                  <div style={{
                    position:'absolute', top:0, left:0, right:0, height:2,
                    background:`linear-gradient(90deg,transparent,${card.accent},transparent)`,
                    opacity:.6,
                  }}/>

                  {/* Icon */}
                  <div style={{
                    width:52, height:52, borderRadius:14,
                    background:card.accentDim,
                    border:`1px solid ${card.accentGlow}`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'1.6rem', color:card.accent, fontFamily:'serif',
                    boxShadow:`0 0 20px ${card.accentDim}`,
                  }}>{card.icon}</div>

                  {/* Text */}
                  <div>
                    <div style={{
                      fontFamily:"'Bebas Neue',cursive",
                      fontSize:'1.85rem', letterSpacing:'0.06em',
                      color:T.textPrimary, lineHeight:1,
                      marginBottom:'0.5rem',
                    }}>{card.label}</div>
                    <div style={{
                      fontFamily:"'DM Sans',sans-serif",
                      fontSize:'0.83rem', fontWeight:300,
                      lineHeight:1.65, color:T.textMuted,
                    }}>{card.sub}</div>
                  </div>

                  {/* Tags */}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:'auto' }}>
                    {card.tags.map(tag => (
                      <span key={tag} style={{
                        fontFamily:"'DM Sans',sans-serif",
                        fontSize:'0.68rem', fontWeight:600,
                        letterSpacing:'0.12em', textTransform:'uppercase',
                        color:card.accent,
                        background:card.accentDim,
                        border:`1px solid ${card.accentGlow}`,
                        borderRadius:999, padding:'4px 12px',
                      }}>{tag}</span>
                    ))}
                  </div>

                  {/* Arrow */}
                  <span className="sq-arrow" style={{
                    position:'absolute', bottom:'1.25rem', right:'1.25rem',
                    fontFamily:'monospace', fontSize:'0.9rem', color:card.accent,
                  }}>→</span>
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <p className="sq-ft" style={{
            fontFamily:"'DM Sans',sans-serif",
            fontSize:'0.68rem', fontWeight:400,
            letterSpacing:'0.3em', textTransform:'uppercase',
            color:'rgba(240,236,227,0.15)',
            marginTop:'clamp(2rem,5vw,3.5rem)',
          }}>
            AR-powered &nbsp;·&nbsp; Hand gestures &nbsp;·&nbsp; No controller needed
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
