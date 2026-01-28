/**
 * Popup script for Prism Pacer extension
 */

// Platform detection
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

// Current site context
let currentHostname = null;
let siteStates = {};

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

/**
 * Get effective enabled state for a feature (per-site or global default)
 */
function getEffectiveEnabled(feature, settings) {
  if (currentHostname && siteStates[currentHostname]?.[`${feature}Enabled`] !== undefined) {
    return siteStates[currentHostname][`${feature}Enabled`];
  }
  return settings[feature]?.enabled || false;
}

// Load settings and update UI
async function loadSettings() {
  // Get current tab's hostname
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      try {
        const url = new URL(tab.url);
        currentHostname = url.hostname;
      } catch (e) {
        // Invalid URL (e.g., chrome:// pages)
        currentHostname = null;
      }
    }
  } catch (e) {
    currentHostname = null;
  }
  
  const result = await chrome.storage.local.get(['settings', 'siteStates']);
  const settings = result.settings || getDefaultSettings();
  siteStates = result.siteStates || {};
  
  // Get effective enabled state for current site
  const pacerEnabled = getEffectiveEnabled('pacer', settings);
  const dimmerEnabled = getEffectiveEnabled('dimmer', settings);
  
  // Update toggles
  pacerToggle.checked = pacerEnabled;
  dimmerToggle.checked = dimmerEnabled;
  
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

/**
 * Save per-site state for a feature
 */
async function saveSiteState(feature, enabled) {
  if (!currentHostname) {
    // Fall back to global setting if no hostname
    return saveGlobalSetting(feature, enabled);
  }
  
  const result = await chrome.storage.local.get(['siteStates']);
  const siteStates = result.siteStates || {};
  
  if (!siteStates[currentHostname]) {
    siteStates[currentHostname] = {};
  }
  siteStates[currentHostname][`${feature}Enabled`] = enabled;
  
  await chrome.storage.local.set({ siteStates });
  
  // Notify content script
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { 
        type: 'SITE_STATE_CHANGED',
        hostname: currentHostname,
        feature,
        enabled
      });
    }
  } catch (e) {
    // Tab might not have content script
  }
}

/**
 * Save global setting (fallback for pages without hostname)
 */
async function saveGlobalSetting(feature, enabled) {
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || getDefaultSettings();
  
  settings[feature].enabled = enabled;
  
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
  saveSiteState('pacer', e.target.checked);
});

dimmerToggle.addEventListener('change', (e) => {
  saveSiteState('dimmer', e.target.checked);
});

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.settings || changes.siteStates)) {
    loadSettings();
  }
});

// Initialize
loadSettings();
