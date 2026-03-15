import type { InterviewState } from './interviewTypes.js';

/**
 * Generate a plain-text clinical report from the completed interview state.
 * Note: no session ID line (stateless design — no server-side session ID).
 */
export function generateReport(state: InterviewState): string {
  const now = new Date().toUTCString();
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('       MARINA MARITIME HEALTH — CLINICAL REPORT');
  lines.push('='.repeat(60));
  lines.push(`Generated : ${now}`);
  lines.push('');

  // ── Primary symptom ──
  lines.push('─'.repeat(60));
  lines.push('PRIMARY SYMPTOM');
  lines.push('─'.repeat(60));
  lines.push(`Symptom: ${state.variables.symptom || 'Not recorded'}`);
  lines.push('');

  // ── Vital signs ──
  lines.push('─'.repeat(60));
  lines.push('VITAL SIGNS');
  lines.push('─'.repeat(60));
  if (state.data.vitals.length === 0) {
    lines.push('No vital signs recorded.');
  } else {
    for (const v of state.data.vitals) {
      lines.push(`  ${v.type.padEnd(16)}: ${v.value} ${v.unit}`);
    }
  }
  lines.push('');

  // ── Investigations ──
  lines.push('─'.repeat(60));
  lines.push('INVESTIGATIONS');
  lines.push('─'.repeat(60));
  if (state.data.investigations.length === 0) {
    lines.push('No investigations recorded.');
  } else {
    for (const inv of state.data.investigations) {
      lines.push(`  [${inv.marker}]`);
      lines.push(`    Q: ${inv.question}`);
    }
  }
  lines.push('');

  // ── Physical examination ──
  lines.push('─'.repeat(60));
  lines.push('PHYSICAL EXAMINATION FINDINGS');
  lines.push('─'.repeat(60));
  if (state.data.examFindings.length === 0) {
    lines.push('No examination findings recorded.');
  } else {
    let currentMarker: string | null = null;
    for (const f of state.data.examFindings) {
      if (f.marker !== currentMarker) {
        currentMarker = f.marker;
        lines.push(`\n  ${f.marker}`);
      }
      lines.push(`    Q${f.questionNumber}/${f.totalQuestions}: ${f.finding}`);
    }
  }
  lines.push('');

  // ── Medical protocol summary ──
  lines.push('─'.repeat(60));
  lines.push('CLINICAL PROTOCOL REFERENCE');
  lines.push('─'.repeat(60));
  if (state.variables.historyTaking && state.variables.historyTaking !== 'undefined') {
    lines.push('History Taking Topics:');
    lines.push(state.variables.historyTaking);
    lines.push('');
  }
  if (state.variables.clinicalExamination && state.variables.clinicalExamination !== 'undefined') {
    lines.push('Clinical Examinations Used:');
    lines.push(state.variables.clinicalExamination);
    lines.push('');
  }
  if (state.variables.investigations && state.variables.investigations !== 'undefined') {
    lines.push('Investigations Protocol:');
    lines.push(state.variables.investigations);
    lines.push('');
  }

  // ── Full conversation transcript ──
  lines.push('─'.repeat(60));
  lines.push('CONVERSATION TRANSCRIPT');
  lines.push('─'.repeat(60));

  for (const msg of state.conversationHistory) {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      lines.push(`\nPATIENT/OFFICER: ${msg.content}`);
    } else if (msg.role === 'assistant' && msg.content) {
      lines.push(`\nMARINA: ${msg.content}`);
    }
    // role: 'tool' messages are skipped — internal plumbing only
  }

  lines.push('');
  lines.push('='.repeat(60));
  lines.push('                    END OF REPORT');
  lines.push('='.repeat(60));

  return lines.join('\n');
}
