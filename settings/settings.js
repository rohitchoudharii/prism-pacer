/**
 * Settings page script for Prism Pacer
 */

// Platform detection
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

// Default settings
const DEFAULT_SETTINGS = {
  pacer: {
    enabled: false,
    height: 4,
    width: '100%',
    color: '#3b82f6',
    opacity: 0.6,
    offset: 0,
    smoothFollow: true,
    smartDetection: true,
    scrollFade: true
  },
  dimmer: {
    enabled: false,
    opacity: 0.7,
    color: '#000000',
    windowHeight: 60,
    transitionSpeed: 100,
    scrollFade: true,
    focusedBox: false
  },
  rsvp: {
    wpm: 300,
    chunkSize: 1,
    fontSize: 32,
    fontFamily: 'system-ui',
    pauseOnPunctuation: true,
    backgroundColor: '#1a1a1a',
    textColor: '#ffffff'
  },
  keybindings: {
    togglePacer: { key: 'p', modifiers: ['Alt', 'Shift'] },
    toggleDimmer: { key: 'd', modifiers: ['Alt', 'Shift'] },
    toggleBoth: { key: 'b', modifiers: ['Alt', 'Shift'] },
    disableAll: { key: 'x', modifiers: ['Alt', 'Shift'] },
    startRsvp: { key: 'r', modifiers: ['Alt', 'Shift'] },
    rsvpPause: { key: ' ', modifiers: [], context: 'rsvp' },
    rsvpSpeedUp: { key: 'ArrowRight', modifiers: [], context: 'rsvp' },
    rsvpSpeedDown: { key: 'ArrowLeft', modifiers: [], context: 'rsvp' },
    rsvpExit: { key: 'Escape', modifiers: [], context: 'rsvp' },
    increaseWindowHeight: { key: 'ArrowUp', modifiers: ['Alt', 'Shift'] },
    decreaseWindowHeight: { key: 'ArrowDown', modifiers: ['Alt', 'Shift'] },
    increaseOpacity: { key: '=', modifiers: ['Alt', 'Shift'] },
    decreaseOpacity: { key: '-', modifiers: ['Alt', 'Shift'] }
  },
  stats: {
    totalWordsRead: 0,
    sessionsCompleted: 0,
    averageWpm: 0,
    lastSessionDate: null
  }
};

// Keybinding action labels
const KEYBINDING_LABELS = {
  togglePacer: 'Toggle Pacer',
  toggleDimmer: 'Toggle Dimmer',
  toggleBoth: 'Toggle Both',
  disableAll: 'Disable All',
  startRsvp: 'Start RSVP',
  rsvpPause: 'RSVP: Pause/Play',
  rsvpSpeedUp: 'RSVP: Speed Up',
  rsvpSpeedDown: 'RSVP: Speed Down',
  rsvpExit: 'RSVP: Exit',
  increaseWindowHeight: 'Increase Window Height',
  decreaseWindowHeight: 'Decrease Window Height',
  increaseOpacity: 'Increase Opacity',
  decreaseOpacity: 'Decrease Opacity'
};

let settings = null;
let currentEditingAction = null;
let capturedBinding = null;

// DOM Elements
const elements = {
  // Pacer
  pacerHeight: document.getElementById('pacer-height'),
  pacerHeightValue: document.getElementById('pacer-height-value'),
  pacerColor: document.getElementById('pacer-color'),
  pacerOpacity: document.getElementById('pacer-opacity'),
  pacerOpacityValue: document.getElementById('pacer-opacity-value'),
  pacerOffset: document.getElementById('pacer-offset'),
  pacerOffsetValue: document.getElementById('pacer-offset-value'),
  pacerSmooth: document.getElementById('pacer-smooth'),
  pacerSmart: document.getElementById('pacer-smart'),
  pacerScrollFade: document.getElementById('pacer-scroll-fade'),
  
  // Dimmer
  dimmerOpacity: document.getElementById('dimmer-opacity'),
  dimmerOpacityValue: document.getElementById('dimmer-opacity-value'),
  dimmerColor: document.getElementById('dimmer-color'),
  dimmerWindow: document.getElementById('dimmer-window'),
  dimmerWindowValue: document.getElementById('dimmer-window-value'),
  dimmerTransition: document.getElementById('dimmer-transition'),
  dimmerTransitionValue: document.getElementById('dimmer-transition-value'),
  dimmerScrollFade: document.getElementById('dimmer-scroll-fade'),
  dimmerFocusedBox: document.getElementById('dimmer-focused-box'),
  
  // RSVP
  rsvpWpm: document.getElementById('rsvp-wpm'),
  rsvpWpmValue: document.getElementById('rsvp-wpm-value'),
  rsvpChunk: document.getElementById('rsvp-chunk'),
  rsvpFontsize: document.getElementById('rsvp-fontsize'),
  rsvpFontsizeValue: document.getElementById('rsvp-fontsize-value'),
  rsvpPause: document.getElementById('rsvp-pause'),
  
  // Keybindings
  keybindingsList: document.getElementById('keybindings-list'),
  
  // Modal
  modal: document.getElementById('keybinding-modal'),
  modalActionName: document.getElementById('modal-action-name'),
  keyCapture: document.getElementById('key-capture'),
  modalCancel: document.getElementById('modal-cancel'),
  modalSave: document.getElementById('modal-save'),
  
  // Buttons
  resetBtn: document.getElementById('reset-btn'),
  saveBtn: document.getElementById('save-btn')
};

/**
 * Format keybinding for display
 */
function formatKeybinding(binding) {
  if (!binding) return '';
  
  const modifierSymbols = {
    'Alt': isMac ? '⌥' : 'Alt',
    'Shift': isMac ? '⇧' : 'Shift',
    'Ctrl': isMac ? '⌃' : 'Ctrl',
    'Meta': isMac ? '⌘' : 'Win'
  };
  
  const parts = (binding.modifiers || []).map(m => modifierSymbols[m] || m);
  
  let keyDisplay = binding.key;
  if (keyDisplay === ' ') keyDisplay = 'Space';
  else if (keyDisplay === 'ArrowUp') keyDisplay = '↑';
  else if (keyDisplay === 'ArrowDown') keyDisplay = '↓';
  else if (keyDisplay === 'ArrowLeft') keyDisplay = '←';
  else if (keyDisplay === 'ArrowRight') keyDisplay = '→';
  else keyDisplay = keyDisplay.toUpperCase();
  
  parts.push(keyDisplay);
  
  return isMac ? parts.join('') : parts.join(' + ');
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['settings'], (result) => {
      settings = result.settings || { ...DEFAULT_SETTINGS };
      resolve(settings);
    });
  });
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  await chrome.storage.local.set({ settings });
  showSavedNotification();
}

/**
 * Populate UI with settings
 */
function populateUI() {
  // Pacer
  elements.pacerHeight.value = settings.pacer.height;
  elements.pacerHeightValue.textContent = `${settings.pacer.height}px`;
  elements.pacerColor.value = settings.pacer.color;
  elements.pacerOpacity.value = settings.pacer.opacity;
  elements.pacerOpacityValue.textContent = `${Math.round(settings.pacer.opacity * 100)}%`;
  elements.pacerOffset.value = settings.pacer.offset;
  elements.pacerOffsetValue.textContent = `${settings.pacer.offset}px`;
  elements.pacerSmooth.checked = settings.pacer.smoothFollow;
  elements.pacerSmart.checked = settings.pacer.smartDetection !== false;
  elements.pacerScrollFade.checked = settings.pacer.scrollFade !== false;
  
  // Dimmer
  elements.dimmerOpacity.value = settings.dimmer.opacity;
  elements.dimmerOpacityValue.textContent = `${Math.round(settings.dimmer.opacity * 100)}%`;
  elements.dimmerColor.value = settings.dimmer.color;
  elements.dimmerWindow.value = settings.dimmer.windowHeight;
  elements.dimmerWindowValue.textContent = `${settings.dimmer.windowHeight}px`;
  elements.dimmerTransition.value = settings.dimmer.transitionSpeed;
  elements.dimmerTransitionValue.textContent = `${settings.dimmer.transitionSpeed}ms`;
  elements.dimmerScrollFade.checked = settings.dimmer.scrollFade !== false;
  elements.dimmerFocusedBox.checked = settings.dimmer.focusedBox || false;
  
  // RSVP
  elements.rsvpWpm.value = settings.rsvp.wpm;
  elements.rsvpWpmValue.textContent = `${settings.rsvp.wpm} WPM`;
  elements.rsvpChunk.value = settings.rsvp.chunkSize;
  elements.rsvpFontsize.value = settings.rsvp.fontSize;
  elements.rsvpFontsizeValue.textContent = `${settings.rsvp.fontSize}px`;
  elements.rsvpPause.checked = settings.rsvp.pauseOnPunctuation;
  
  // Keybindings
  renderKeybindings();
}

/**
 * Render keybindings list
 */
function renderKeybindings() {
  elements.keybindingsList.innerHTML = '';
  
  for (const [action, binding] of Object.entries(settings.keybindings)) {
    const label = KEYBINDING_LABELS[action] || action;
    const formattedKey = formatKeybinding(binding);
    
    const row = document.createElement('div');
    row.className = 'keybinding-row';
    row.innerHTML = `
      <span class="keybinding-name">${label}</span>
      <div class="keybinding-key">
        <kbd>${formattedKey}</kbd>
        <button class="keybinding-edit" data-action="${action}">Edit</button>
      </div>
    `;
    
    elements.keybindingsList.appendChild(row);
  }
  
  // Add click handlers for edit buttons
  document.querySelectorAll('.keybinding-edit').forEach(btn => {
    btn.addEventListener('click', () => openKeybindingModal(btn.dataset.action));
  });
}

/**
 * Open keybinding editor modal
 */
function openKeybindingModal(action) {
  currentEditingAction = action;
  capturedBinding = null;
  
  elements.modalActionName.textContent = KEYBINDING_LABELS[action] || action;
  elements.keyCapture.textContent = 'Press your desired key combination...';
  elements.keyCapture.classList.remove('active');
  
  elements.modal.classList.add('active');
  
  // Start listening for key capture
  document.addEventListener('keydown', handleKeyCapture);
}

/**
 * Close keybinding modal
 */
function closeKeybindingModal() {
  elements.modal.classList.remove('active');
  currentEditingAction = null;
  capturedBinding = null;
  
  document.removeEventListener('keydown', handleKeyCapture);
}

/**
 * Get the physical key from an event
 * Uses event.code to handle Mac Option key producing special characters
 */
function getPhysicalKey(event) {
  const code = event.code;
  
  // Letter keys: KeyA -> a, KeyB -> b, etc.
  if (code && code.startsWith('Key')) {
    return code.slice(3).toLowerCase();
  }
  
  // Digit keys: Digit1 -> 1, Digit2 -> 2, etc.
  if (code && code.startsWith('Digit')) {
    return code.slice(5);
  }
  
  // Special keys mapping
  const codeMap = {
    'Space': ' ',
    'Escape': 'Escape',
    'ArrowUp': 'ArrowUp',
    'ArrowDown': 'ArrowDown',
    'ArrowLeft': 'ArrowLeft',
    'ArrowRight': 'ArrowRight',
    'Equal': '=',
    'Minus': '-',
    'BracketLeft': '[',
    'BracketRight': ']',
    'Semicolon': ';',
    'Quote': "'",
    'Comma': ',',
    'Period': '.',
    'Slash': '/',
    'Backslash': '\\',
    'Backquote': '`'
  };
  
  if (code && codeMap[code]) {
    return codeMap[code];
  }
  
  // Fallback to event.key for other keys
  return event.key;
}

/**
 * Handle key capture in modal
 */
function handleKeyCapture(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // Escape cancels (only if no modifiers)
  if (e.code === 'Escape' && !e.altKey && !e.shiftKey && !e.ctrlKey) {
    closeKeybindingModal();
    return;
  }
  
  // Get the physical key using event.code
  // This fixes Mac where Option+Shift+P produces special characters
  const key = getPhysicalKey(e);
  
  // Capture the binding
  capturedBinding = {
    key: key,
    modifiers: []
  };
  
  if (e.altKey) capturedBinding.modifiers.push('Alt');
  if (e.shiftKey) capturedBinding.modifiers.push('Shift');
  if (e.ctrlKey) capturedBinding.modifiers.push('Ctrl');
  if (e.metaKey) capturedBinding.modifiers.push('Meta');
  
  // Preserve context if original had one
  const original = settings.keybindings[currentEditingAction];
  if (original && original.context) {
    capturedBinding.context = original.context;
  }
  
  // Display captured binding
  elements.keyCapture.textContent = formatKeybinding(capturedBinding);
  elements.keyCapture.classList.add('active');
}

/**
 * Save captured keybinding
 */
function saveKeybinding() {
  if (!capturedBinding || !currentEditingAction) return;
  
  settings.keybindings[currentEditingAction] = capturedBinding;
  renderKeybindings();
  closeKeybindingModal();
}

/**
 * Show saved notification
 */
function showSavedNotification() {
  let notification = document.querySelector('.saved-notification');
  
  if (!notification) {
    notification = document.createElement('div');
    notification.className = 'saved-notification';
    notification.textContent = '✓ Settings saved';
    document.body.appendChild(notification);
  }
  
  notification.classList.add('show');
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, 2000);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Pacer
  elements.pacerHeight.addEventListener('input', (e) => {
    settings.pacer.height = parseInt(e.target.value);
    elements.pacerHeightValue.textContent = `${e.target.value}px`;
  });
  
  elements.pacerColor.addEventListener('input', (e) => {
    settings.pacer.color = e.target.value;
  });
  
  elements.pacerOpacity.addEventListener('input', (e) => {
    settings.pacer.opacity = parseFloat(e.target.value);
    elements.pacerOpacityValue.textContent = `${Math.round(e.target.value * 100)}%`;
  });
  
  elements.pacerOffset.addEventListener('input', (e) => {
    settings.pacer.offset = parseInt(e.target.value);
    elements.pacerOffsetValue.textContent = `${e.target.value}px`;
  });
  
  elements.pacerSmooth.addEventListener('change', (e) => {
    settings.pacer.smoothFollow = e.target.checked;
  });
  
  elements.pacerSmart.addEventListener('change', (e) => {
    settings.pacer.smartDetection = e.target.checked;
  });
  
  elements.pacerScrollFade.addEventListener('change', (e) => {
    settings.pacer.scrollFade = e.target.checked;
  });
  
  // Dimmer
  elements.dimmerOpacity.addEventListener('input', (e) => {
    settings.dimmer.opacity = parseFloat(e.target.value);
    elements.dimmerOpacityValue.textContent = `${Math.round(e.target.value * 100)}%`;
  });
  
  elements.dimmerColor.addEventListener('input', (e) => {
    settings.dimmer.color = e.target.value;
  });
  
  elements.dimmerWindow.addEventListener('input', (e) => {
    settings.dimmer.windowHeight = parseInt(e.target.value);
    elements.dimmerWindowValue.textContent = `${e.target.value}px`;
  });
  
  elements.dimmerTransition.addEventListener('input', (e) => {
    settings.dimmer.transitionSpeed = parseInt(e.target.value);
    elements.dimmerTransitionValue.textContent = `${e.target.value}ms`;
  });
  
  elements.dimmerScrollFade.addEventListener('change', (e) => {
    settings.dimmer.scrollFade = e.target.checked;
  });
  
  elements.dimmerFocusedBox.addEventListener('change', (e) => {
    settings.dimmer.focusedBox = e.target.checked;
  });
  
  // RSVP
  elements.rsvpWpm.addEventListener('input', (e) => {
    settings.rsvp.wpm = parseInt(e.target.value);
    elements.rsvpWpmValue.textContent = `${e.target.value} WPM`;
  });
  
  elements.rsvpChunk.addEventListener('change', (e) => {
    settings.rsvp.chunkSize = parseInt(e.target.value);
  });
  
  elements.rsvpFontsize.addEventListener('input', (e) => {
    settings.rsvp.fontSize = parseInt(e.target.value);
    elements.rsvpFontsizeValue.textContent = `${e.target.value}px`;
  });
  
  elements.rsvpPause.addEventListener('change', (e) => {
    settings.rsvp.pauseOnPunctuation = e.target.checked;
  });
  
  // Modal
  elements.modalCancel.addEventListener('click', closeKeybindingModal);
  elements.modalSave.addEventListener('click', saveKeybinding);
  
  // Close modal on backdrop click
  elements.modal.addEventListener('click', (e) => {
    if (e.target === elements.modal) {
      closeKeybindingModal();
    }
  });
  
  // Buttons
  elements.resetBtn.addEventListener('click', async () => {
    if (confirm('Reset all settings to defaults?')) {
      settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      populateUI();
      await saveSettings();
    }
  });
  
  elements.saveBtn.addEventListener('click', saveSettings);
}

/**
 * Initialize
 */
async function init() {
  await loadSettings();
  populateUI();
  setupEventListeners();
}

init();
