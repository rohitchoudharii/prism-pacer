/**
 * Popup script for Prism Pacer extension
 */

// Platform detection
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

function getModifierSymbol(modifier) {
  const symbols = {
    'Alt': isMac ? '⌥' : 'Alt',
    'Shift': isMac ? '⇧' : 'Shift',
    'Ctrl': isMac ? '⌃' : 'Ctrl',
    'Meta': isMac ? '⌘' : 'Win'
  };
  return symbols[modifier] || modifier;
}

function formatKeybinding(binding) {
  if (!binding) return '';
  const parts = binding.modifiers.map(m => getModifierSymbol(m));
  const keyDisplay = binding.key === ' ' ? 'Space' : binding.key.toUpperCase();
  parts.push(keyDisplay);
  return isMac ? parts.join('') : parts.join(' + ');
}

// DOM Elements
const pacerToggle = document.getElementById('pacer-toggle');
const dimmerToggle = document.getElementById('dimmer-toggle');
const pacerShortcut = document.getElementById('pacer-shortcut');
const dimmerShortcut = document.getElementById('dimmer-shortcut');
const rsvpShortcut = document.getElementById('rsvp-shortcut');
const wordsRead = document.getElementById('words-read');
const sessions = document.getElementById('sessions');
const settingsBtn = document.getElementById('settings-btn');

// Load settings and update UI
async function loadSettings() {
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || getDefaultSettings();
  
  // Update toggles
  pacerToggle.checked = settings.pacer?.enabled || false;
  dimmerToggle.checked = settings.dimmer?.enabled || false;
  
  // Update shortcut hints
  pacerShortcut.textContent = `Shortcut: ${formatKeybinding(settings.keybindings?.togglePacer)}`;
  dimmerShortcut.textContent = `Shortcut: ${formatKeybinding(settings.keybindings?.toggleDimmer)}`;
  rsvpShortcut.textContent = formatKeybinding(settings.keybindings?.startRsvp);
  
  // Update stats
  wordsRead.textContent = formatNumber(settings.stats?.totalWordsRead || 0);
  sessions.textContent = settings.stats?.sessionsCompleted || 0;
}

function getDefaultSettings() {
  return {
    pacer: { enabled: false },
    dimmer: { enabled: false },
    keybindings: {
      togglePacer: { key: 'p', modifiers: ['Alt', 'Shift'] },
      toggleDimmer: { key: 'd', modifiers: ['Alt', 'Shift'] },
      startRsvp: { key: 'r', modifiers: ['Alt', 'Shift'] }
    },
    stats: {
      totalWordsRead: 0,
      sessionsCompleted: 0
    }
  };
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// Save setting and notify content script
async function saveSetting(path, value) {
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || getDefaultSettings();
  
  // Set nested value
  const keys = path.split('.');
  const lastKey = keys.pop();
  let target = settings;
  for (const key of keys) {
    if (!target[key]) target[key] = {};
    target = target[key];
  }
  target[lastKey] = value;
  
  await chrome.storage.local.set({ settings });
  
  // Notify active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { 
        type: 'SETTINGS_CHANGED',
        settings: settings
      });
    }
  } catch (e) {
    // Tab might not have content script
  }
}

// Event Listeners
pacerToggle.addEventListener('change', (e) => {
  saveSetting('pacer.enabled', e.target.checked);
});

dimmerToggle.addEventListener('change', (e) => {
  saveSetting('dimmer.enabled', e.target.checked);
});

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.settings) {
    loadSettings();
  }
});

// Initialize
loadSettings();
