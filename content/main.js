/**
 * Main entry point for Prism Pacer content script
 * Initializes all features and wires up keybindings
 */

(function() {
  'use strict';
  
  // Avoid running multiple times
  if (window.speedReaderInitialized) return;
  window.speedReaderInitialized = true;
  
  let settings = null;
  let siteStates = {};
  let cursorHidden = false;
  const hostname = window.location.hostname;
  
  /**
   * Initialize the extension
   */
  async function init() {
    // Load settings
    settings = await loadSettings();
    
    // Initialize keybindings
    initKeybindings();
    
    // Apply initial state
    applySettings(settings);
    
    // Listen for settings changes from popup/storage
    chrome.storage.onChanged.addListener(handleStorageChange);
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(handleMessage);
    
    console.log('Prism Pacer initialized');
  }
  
  /**
   * Load settings from storage
   */
  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings', 'siteStates'], (result) => {
        siteStates = result.siteStates || {};
        if (result.settings) {
          resolve(result.settings);
        } else {
          // Use defaults
          resolve(getDefaultSettings());
        }
      });
    });
  }
  
  /**
   * Get default settings
   */
  function getDefaultSettings() {
    return {
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
        decreaseOpacity: { key: '-', modifiers: ['Alt', 'Shift'] },
        toggleCursor: { key: 'c', modifiers: ['Alt', 'Shift'] }
      },
      stats: {
        totalWordsRead: 0,
        sessionsCompleted: 0,
        averageWpm: 0,
        lastSessionDate: null
      }
    };
  }
  
  /**
   * Get effective enabled state for a feature (per-site or global default)
   */
  function getEffectiveEnabled(feature) {
    const siteState = siteStates[hostname];
    if (siteState && siteState[`${feature}Enabled`] !== undefined) {
      return siteState[`${feature}Enabled`];
    }
    return settings[feature].enabled;
  }
  
  /**
   * Save per-site state for a feature
   */
  async function saveSiteState(feature, enabled) {
    if (!siteStates[hostname]) {
      siteStates[hostname] = {};
    }
    siteStates[hostname][`${feature}Enabled`] = enabled;
    await chrome.storage.local.set({ siteStates });
  }
  
  /**
   * Set cursor visibility
   */
  function setCursorHidden(hide) {
    cursorHidden = hide;
    if (hide) {
      document.body.classList.add('prism-pacer-cursor-hidden');
    } else {
      document.body.classList.remove('prism-pacer-cursor-hidden');
    }
  }
  
  /**
   * Initialize keybindings
   */
  function initKeybindings() {
    keybindingManager.init(settings.keybindings);
    
    // Register action handlers
    keybindingManager.register('togglePacer', () => {
      const enabled = pacer.toggle();
      toast.toggle('Visual Pacer', enabled);
      saveSiteState('pacer', enabled);
    });
    
    keybindingManager.register('toggleDimmer', () => {
      const enabled = dimmer.toggle();
      toast.toggle('Page Dimmer', enabled);
      saveSiteState('dimmer', enabled);
      // Auto-restore cursor when dimmer is disabled
      if (!enabled) {
        setCursorHidden(false);
      }
    });
    
    keybindingManager.register('toggleBoth', () => {
      const pacerEnabled = pacer.isEnabled();
      const dimmerEnabled = dimmer.isEnabled();
      
      // If either is on, turn both off. Otherwise turn both on.
      const newState = !(pacerEnabled || dimmerEnabled);
      
      if (newState) {
        pacer.enable();
        dimmer.enable();
      } else {
        pacer.disable();
        dimmer.disable();
        // Auto-restore cursor when dimmer is disabled
        setCursorHidden(false);
      }
      
      toast.toggle('Pacer + Dimmer', newState);
      saveSiteState('pacer', newState);
      saveSiteState('dimmer', newState);
    });
    
    keybindingManager.register('disableAll', () => {
      pacer.disable();
      dimmer.disable();
      if (rsvpPlayer.isActive()) {
        rsvpPlayer.exit();
      }
      // Auto-restore cursor
      setCursorHidden(false);
      toast.show('All features disabled', '✗');
      saveSiteState('pacer', false);
      saveSiteState('dimmer', false);
    });
    
    keybindingManager.register('startRsvp', () => {
      const selectedText = window.getSelection().toString().trim();
      if (selectedText) {
        rsvpPlayer.updateSettings(settings.rsvp);
        rsvpPlayer.start(selectedText);
      } else {
        toast.show('Select text first', '⚠', 2000);
      }
    });
    
    // RSVP context controls
    keybindingManager.register('rsvpPause', () => {
      if (rsvpPlayer.isActive()) {
        rsvpPlayer.togglePlay();
      }
    });
    
    keybindingManager.register('rsvpSpeedUp', () => {
      if (rsvpPlayer.isActive()) {
        rsvpPlayer.adjustSpeed(50);
      }
    });
    
    keybindingManager.register('rsvpSpeedDown', () => {
      if (rsvpPlayer.isActive()) {
        rsvpPlayer.adjustSpeed(-50);
      }
    });
    
    keybindingManager.register('rsvpExit', () => {
      if (rsvpPlayer.isActive()) {
        rsvpPlayer.exit();
      }
    });
    
    // Quick adjustment controls
    keybindingManager.register('increaseWindowHeight', () => {
      if (dimmer.isEnabled()) {
        settings.dimmer.windowHeight = Math.min(200, settings.dimmer.windowHeight + 10);
        dimmer.updateSettings(settings.dimmer);
        toast.adjust('Window Height', `${settings.dimmer.windowHeight}px`);
        saveSetting('dimmer.windowHeight', settings.dimmer.windowHeight);
      }
    });
    
    keybindingManager.register('decreaseWindowHeight', () => {
      if (dimmer.isEnabled()) {
        settings.dimmer.windowHeight = Math.max(30, settings.dimmer.windowHeight - 10);
        dimmer.updateSettings(settings.dimmer);
        toast.adjust('Window Height', `${settings.dimmer.windowHeight}px`);
        saveSetting('dimmer.windowHeight', settings.dimmer.windowHeight);
      }
    });
    
    keybindingManager.register('increaseOpacity', () => {
      if (dimmer.isEnabled()) {
        settings.dimmer.opacity = Math.min(0.95, settings.dimmer.opacity + 0.1);
        dimmer.updateSettings(settings.dimmer);
        toast.adjust('Dimmer Opacity', `${Math.round(settings.dimmer.opacity * 100)}%`);
        saveSetting('dimmer.opacity', settings.dimmer.opacity);
      }
    });
    
    keybindingManager.register('decreaseOpacity', () => {
      if (dimmer.isEnabled()) {
        settings.dimmer.opacity = Math.max(0.3, settings.dimmer.opacity - 0.1);
        dimmer.updateSettings(settings.dimmer);
        toast.adjust('Dimmer Opacity', `${Math.round(settings.dimmer.opacity * 100)}%`);
        saveSetting('dimmer.opacity', settings.dimmer.opacity);
      }
    });
    
    // Toggle cursor visibility (only when dimmer is active)
    keybindingManager.register('toggleCursor', () => {
      if (dimmer.isEnabled()) {
        setCursorHidden(!cursorHidden);
        toast.toggle('Cursor', !cursorHidden);
      }
    });
  }
  
  /**
   * Apply settings to features
   */
  function applySettings(settings) {
    // Update pacer
    pacer.updateSettings(settings.pacer);
    if (getEffectiveEnabled('pacer')) {
      pacer.enable();
    } else {
      pacer.disable();
    }
    
    // Update dimmer
    dimmer.updateSettings(settings.dimmer);
    if (getEffectiveEnabled('dimmer')) {
      dimmer.enable();
    } else {
      dimmer.disable();
      // Auto-restore cursor when dimmer is disabled
      setCursorHidden(false);
    }
    
    // Update RSVP settings
    rsvpPlayer.updateSettings(settings.rsvp);
    
    // Update keybindings
    keybindingManager.updateBindings(settings.keybindings);
  }
  
  /**
   * Save a setting to storage
   */
  async function saveSetting(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    
    let target = settings;
    for (const key of keys) {
      if (!target[key]) target[key] = {};
      target = target[key];
    }
    target[lastKey] = value;
    
    await chrome.storage.local.set({ settings });
  }
  
  /**
   * Handle storage changes
   */
  function handleStorageChange(changes, namespace) {
    if (namespace === 'local') {
      if (changes.settings) {
        settings = changes.settings.newValue;
      }
      if (changes.siteStates) {
        siteStates = changes.siteStates.newValue || {};
      }
      if (changes.settings || changes.siteStates) {
        applySettings(settings);
      }
    }
  }
  
  /**
   * Handle messages from popup
   */
  function handleMessage(message, sender, sendResponse) {
    if (message.type === 'SETTINGS_CHANGED') {
      settings = message.settings;
      applySettings(settings);
      sendResponse({ success: true });
    }
    
    if (message.type === 'SITE_STATE_CHANGED') {
      // Update local siteStates and apply
      if (message.hostname === hostname) {
        if (!siteStates[hostname]) {
          siteStates[hostname] = {};
        }
        siteStates[hostname][`${message.feature}Enabled`] = message.enabled;
        applySettings(settings);
      }
      sendResponse({ success: true });
    }
    
    if (message.type === 'GET_STATE') {
      sendResponse({
        pacerEnabled: pacer.isEnabled(),
        dimmerEnabled: dimmer.isEnabled(),
        rsvpActive: rsvpPlayer.isActive()
      });
    }
    
    return true; // Keep message channel open for async response
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
