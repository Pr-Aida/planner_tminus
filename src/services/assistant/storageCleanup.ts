import { loadHistory, saveHistory, clearHistory, loadFeedback, loadFocusSessions, clearAllAssistantData, getStorageEstimate } from './memory';
import type { HistoryLimit } from './types';

export function runCleanup(limit: HistoryLimit): void {
  const history = loadHistory();
  if (limit === 0) { clearHistory(); }
  else if (history.length > limit) { saveHistory(history, limit); }

  const feedback = loadFeedback();
  if (feedback.length > 100) {
    try { localStorage.setItem('tminus-assistant-feedback', JSON.stringify(feedback.slice(-100))); } catch { /* ignore */ }
  }

  const focus = loadFocusSessions();
  if (focus.length > 200) {
    try { localStorage.setItem('tminus-assistant-focus', JSON.stringify(focus.slice(-200))); } catch { /* ignore */ }
  }
}

export function clearAssistantCache(): void {
  try {
    localStorage.removeItem('tminus-assistant-active-timer');
  } catch { /* ignore */ }
}

export function clearAssistantHistory(): void {
  clearHistory();
}

export function deleteAllAssistantData(): void {
  clearAllAssistantData();
}

export function getStorageStatus(): { assistantBytes: number; status: 'normal' | 'moderate' | 'high' | 'critical' } {
  return getStorageEstimate();
}
