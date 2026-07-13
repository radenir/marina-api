export interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  ship_name: string | null;
  call_sign: string | null;
  satellite_phone: string | null;
  medicine_chest: string | null;
  cruise_speed_knots: number | null;
  company: string | null;
  language: string | null;
  email_verified: boolean;
  is_active: boolean;
  mfa_enabled: boolean;
  reset_token_version: number;
  password_hash_algo: 'bcrypt' | 'argon2id';
  created_at: Date;
  updated_at: Date;
}

export interface RefreshToken {
  id: string;
  token_hash: string;
  family_id: string;
  user_id: string;
  device_name: string | null;
  device_type: 'ios' | 'android' | 'web' | 'server' | null;
  ip_address_hash: string | null;
  expires_at: Date;
  used: boolean;
  created_at: Date;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  event_type: AuditEventType;
  ip_address_hash: string | null;
  user_agent_hash: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export type AuditEventType =
  | 'register'
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'token_refresh'
  | 'token_reuse_detected'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'email_verified'
  | 'email_verification_resent'
  | 'profile_updated'
  | 'conversation_summarized'
  | 'audio_transcribed'
  | 'text_translated'
  | 'text_to_speech'
  | 'medical_record_extracted'
  | 'report_followups_generated'
  | 'exam_followups_generated'
  | 'problem_score_generated'
  | 'allergy_score_generated'
  | 'medication_score_generated'
  | 'associated_symptoms_score_generated'
  | 'past_medical_history_score_generated'
  | 'investigation_score_generated'
  | 'pdf_generated'
  | 'pdf_emailed'
  | 'interview_message_sent';

export interface JWTPayload {
  sub: string;       // userId
  jti: string;       // unique token id
  iat: number;
  exp: number;
  roles: string[];
}

export interface DeviceInfo {
  device_name: string;
  device_type: 'ios' | 'android' | 'web' | 'server';
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: Pick<User, 'id' | 'role'>;
      jti?: string;
      principal?: import('./principal').Principal;
    }
  }
}
