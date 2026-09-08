// PhoneFrame — a white iPhone-style device shell that holds a rendered app
// screen. Optionally draws the app's large navigation title and the 4-tab
// bottom bar, so screens look like the real SwiftUI app.
import React from 'react';
import { Stethoscope, Mic, MessagesSquare, User, Wifi, SignalHigh } from 'lucide-react';
import { NAVY, INK, MUTED, FONT_FAMILY, BORDER } from '../theme';

export const PHONE_W = 540;
export const PHONE_H = 1120;

const TAB_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  interview: Stethoscope,
  note: Mic,
  translator: MessagesSquare,
  profile: User,
};

const TABS = [
  { key: 'interview', label: 'AI Interview' },
  { key: 'note', label: 'Note Taker' },
  { key: 'translator', label: 'Translator' },
  { key: 'profile', label: 'Profile' },
];

export const TabBar: React.FC<{ active: string }> = ({ active }) => (
  <div
    style={{
      display: 'flex',
      borderTop: `1px solid ${BORDER}`,
      background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(8px)',
      paddingBottom: 22,
      paddingTop: 10,
    }}
  >
    {TABS.map((t) => {
      const Icon = TAB_ICONS[t.key];
      const on = t.key === active;
      return (
        <div
          key={t.key}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 5,
            color: on ? NAVY : MUTED,
          }}
        >
          <Icon size={26} color={on ? NAVY : MUTED} strokeWidth={on ? 2.4 : 2} />
          <span style={{ fontSize: 15, fontWeight: on ? 700 : 500 }}>{t.label}</span>
        </div>
      );
    })}
  </div>
);

export const PhoneFrame: React.FC<{
  children: React.ReactNode;
  title?: string;
  activeTab?: string;
  style?: React.CSSProperties;
  bg?: string;
}> = ({ children, title, activeTab, style, bg = '#ffffff' }) => (
  <div
    style={{
      width: PHONE_W,
      height: PHONE_H,
      borderRadius: 58,
      border: '11px solid #0b1f30',
      background: bg,
      boxShadow: '0 40px 90px rgba(8,35,60,0.35), 0 8px 24px rgba(8,35,60,0.25)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: FONT_FAMILY,
      position: 'relative',
      ...style,
    }}
  >
    {/* status bar / notch */}
    <div
      style={{
        height: 44,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 34px',
        color: INK,
        fontSize: 17,
        fontWeight: 600,
      }}
    >
      <span style={{ fontWeight: 700, letterSpacing: 0.3 }}>9:41</span>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 12,
          transform: 'translateX(-50%)',
          width: 130,
          height: 26,
          borderRadius: 16,
          background: '#0b1f30',
        }}
      />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        <SignalHigh size={22} color={INK} strokeWidth={2.4} />
        <Wifi size={22} color={INK} strokeWidth={2.4} />
        {/* battery */}
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          <span
            style={{
              width: 27,
              height: 14,
              border: `2px solid ${INK}`,
              borderRadius: 4,
              padding: 2,
              display: 'inline-flex',
            }}
          >
            <span style={{ flex: 1, background: INK, borderRadius: 1 }} />
          </span>
          <span style={{ width: 2, height: 6, background: INK, borderRadius: 1, marginLeft: 1 }} />
        </span>
      </span>
    </div>

    {/* large navigation title */}
    {title && (
      <div style={{ padding: '4px 26px 12px', flex: 'none' }}>
        <div style={{ fontSize: 34, fontWeight: 800, color: INK, letterSpacing: -0.5 }}>
          {title}
        </div>
      </div>
    )}

    {/* screen content */}
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>

    {/* bottom tab bar */}
    {activeTab && <TabBar active={activeTab} />}
  </div>
);
