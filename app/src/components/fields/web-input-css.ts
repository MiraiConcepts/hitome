// One-time stylesheet for the raw DOM date/time inputs (web only) — pseudo
// elements can't be styled inline. Chrome's indicator is hidden (the whole
// field opens the picker); Firefox/Safari have nothing to hide.
import { AccentColor } from '@/constants/theme';

let injected = false;

export function ensureFieldCss(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = `
.hitome-field-input {
  appearance: none;
  -webkit-appearance: none;
  border: none;
  cursor: pointer;
}
.hitome-field-input::-webkit-calendar-picker-indicator {
  display: none;
}
.hitome-field-input:focus-visible {
  outline: 2px solid ${AccentColor};
  outline-offset: -2px;
}
`;
  document.head.appendChild(style);
}
