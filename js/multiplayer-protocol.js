export const MULTIPLAYER_ROLES = Object.freeze({
  controls: {
    name: 'Controls Technician',
    short: 'CTRL',
    color: '#56c7ff',
    duty: 'Open ESCO Logic, correlate the crew evidence, and submit the failed I/O tag.',
  },
  operator: {
    name: 'Control Room Operator',
    short: 'HMI',
    color: '#f0b84b',
    duty: 'Open the live HMI, acknowledge the alarm, and report the process response.',
  },
  field: {
    name: 'Field Operator',
    short: 'FIELD',
    color: '#63d887',
    duty: 'Reach the failed equipment, inspect the physical condition, and report from the field.',
  },
  maintenance: {
    name: 'Maintenance Lead',
    short: 'MAINT',
    color: '#d996ff',
    duty: 'Check ESCO diagnostics and maintenance history, then relay the failure evidence.',
  },
});

export const MULTIPLAYER_LIMIT = 4;

export function cleanCallsign(value) {
  return String(value || '')
    .replace(/[^a-z0-9 _.-]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 18) || 'TECH';
}

export function cleanRoomCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

export function normalizeTag(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

