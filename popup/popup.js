/**
 * Popup script for Prism Pacer extension
 */

// Platform detection
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

// Current tab context
let currentTabId = null;
let tabState = {};

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
 * Get effective enabled state for a feature (per-tab or global default)
 */
function getEffectiveEnabled(feature, settings) {
  if (tabState && tabState[`${feature}Enabled`] !== undefined) {
    return tabState[`${feature}Enabled`];
  }
  return settings[feature]?.enabled || false;
}

// Load settings and update UI
async function loadSettings() {
  // Get current tab id
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab?.id || null;
  } catch (e) {
    currentTabId = null;
  }
  
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || getDefaultSettings();
  tabState = {};
  if (currentTabId !== null) {
    try {
      tabState = await chrome.runtime.sendMessage({ type: 'GET_TAB_STATE', tabId: currentTabId }) || {};
    } catch (e) {
      tabState = {};
    }
  }
  
  // Get effective enabled state for current tab
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
    controlMode: {
      mode: 'mouse',
      keyboardView: 'narrow'
    },
    keybindings: {
      togglePacer: { key: 'p', modifiers: ['Alt', 'Shift'] },
      toggleDimmer: { key: 'd', modifiers: ['Alt', 'Shift'] },
      startRsvp: { key: 'r', modifiers: ['Alt', 'Shift'] },
      reselectReadingElement: { key: 's', modifiers: ['Alt', 'Shift'] },
      convertToMarkdown: { key: 'm', modifiers: ['Alt', 'Shift'] }
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
 * Save per-tab state for a feature
 */
async function saveTabState(feature, enabled) {
  if (currentTabId === null) {
    // Fall back to global setting if no tab
    return saveGlobalSetting(feature, enabled);
  }
  
  try {
    await chrome.runtime.sendMessage({
      type: 'SET_TAB_STATE',
      tabId: currentTabId,
      feature,
      enabled
    });
  } catch (e) {
    // Tab might not have content script
  }
}

/**
 * Save global setting (fallback for pages without a tab)
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
  saveTabState('pacer', e.target.checked);
});

dimmerToggle.addEventListener('change', (e) => {
  saveTabState('dimmer', e.target.checked);
});

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.settings || changes.tabStates)) {
    loadSettings();
  }
});

// Initialize
loadSettings();
