// LoginScreen — pixel-faithful to ContentView.swift LoginView: navy logo,
// navy "Welcome to Marina", gray tagline, bold labels, borderless light-gray
// fields with placeholders, "Forgot your password?" inline with the Password
// label, a full-pill navy Sign In, and the Register footer.
import React from 'react';
import { Eye } from 'lucide-react';
import { Logo } from '../components/Logo';
import { NAVY, INK, MUTED } from '../theme';

const FIELD_BG = '#f1f2f4';
const PLACEHOLDER = '#9aa0a8';

const Input: React.FC<{ placeholder: string; secure?: boolean }> = ({
  placeholder,
  secure,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: FIELD_BG,
      borderRadius: 14,
      padding: '19px 20px',
      fontSize: 23,
      color: PLACEHOLDER,
    }}
  >
    <span>{placeholder}</span>
    {secure && <Eye size={24} color={INK} strokeWidth={1.8} />}
  </div>
);

export const LoginScreen: React.FC = () => (
  <div
    style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '48px 34px 0',
    }}
  >
    <Logo size={132} style={{ marginTop: 40 }} />
    <div style={{ fontSize: 46, fontWeight: 800, color: NAVY, marginTop: 22, letterSpacing: -0.5 }}>
      Welcome to Marina
    </div>
    <div style={{ fontSize: 22, fontWeight: 400, color: MUTED, marginTop: 10, marginBottom: 54 }}>
      Maritime Medical Incident Reporting
    </div>

    <div style={{ width: '100%' }}>
      {/* Email */}
      <div style={{ fontSize: 25, fontWeight: 700, color: INK, marginBottom: 12 }}>Email</div>
      <Input placeholder="you@example.com" />

      {/* Password + inline forgot link */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '26px 0 12px',
        }}
      >
        <span style={{ fontSize: 25, fontWeight: 700, color: INK }}>Password</span>
        <span style={{ fontSize: 22, fontWeight: 600, color: NAVY }}>Forgot your password?</span>
      </div>
      <Input placeholder="Enter your password" secure />

      {/* Sign In — full pill */}
      <div
        style={{
          marginTop: 34,
          background: NAVY,
          borderRadius: 999,
          padding: '22px 0',
          textAlign: 'center',
          color: '#fff',
          fontSize: 27,
          fontWeight: 700,
        }}
      >
        Sign In
      </div>

      <div style={{ textAlign: 'center', marginTop: 30, fontSize: 22, color: MUTED }}>
        Don’t have an account?{' '}
        <span style={{ color: NAVY, fontWeight: 700 }}>Register</span>
      </div>
    </div>
  </div>
);
