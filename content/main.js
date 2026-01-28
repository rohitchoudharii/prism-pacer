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
      chrome.storage.local.get(['settings'], (result) => {
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
        decreaseOpacity: { key: '-', modifiers: ['Alt', 'Shift'] }
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
   * Initialize keybindings
   */
  function initKeybindings() {
    keybindingManager.init(settings.keybindings);
    
    // Register action handlers
    keybindingManager.register('togglePacer', () => {
      const enabled = pacer.toggle();
      toast.toggle('Visual Pacer', enabled);
      saveSetting('pacer.enabled', enabled);
    });
    
    keybindingManager.register('toggleDimmer', () => {
      const enabled = dimmer.toggle();
      toast.toggle('Page Dimmer', enabled);
      saveSetting('dimmer.enabled', enabled);
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
      }
      
      toast.toggle('Pacer + Dimmer', newState);
      saveSetting('pacer.enabled', newState);
      saveSetting('dimmer.enabled', newState);
    });
    
    keybindingManager.register('disableAll', () => {
      pacer.disable();
      dimmer.disable();
      if (rsvpPlayer.isActive()) {
        rsvpPlayer.exit();
      }
      toast.show('All features disabled', '✗');
      saveSetting('pacer.enabled', false);
      saveSetting('dimmer.enabled', false);
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
  }
  
  /**
   * Apply settings to features
   */
  function applySettings(settings) {
    // Update pacer
    pacer.updateSettings(settings.pacer);
    if (settings.pacer.enabled) {
      pacer.enable();
    } else {
      pacer.disable();
    }
    
    // Update dimmer
    dimmer.updateSettings(settings.dimmer);
    if (settings.dimmer.enabled) {
      dimmer.enable();
    } else {
      dimmer.disable();
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
    if (namespace === 'local' && changes.settings) {
      settings = changes.settings.newValue;
      applySettings(settings);
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
