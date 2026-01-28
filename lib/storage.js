/**
 * Storage utility for Prism Pacer extension
 * Handles all Chrome storage operations with default settings
 */

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
    scrollFade: true  // Fade animation on scroll vs instant hide
  },

  dimmer: {
    enabled: false,
    opacity: 0.7,
    color: '#000000',
    windowHeight: 60,
    transitionSpeed: 100,
    scrollFade: true,  // Fade animation on scroll vs instant hide
    focusedBox: false  // Use focused box mode vs banner mode
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

/**
 * Storage manager class
 */
class StorageManager {
  constructor() {
    this.cache = null;
  }

  /**
   * Get all settings, initializing with defaults if needed
   */
  async getAll() {
    if (this.cache) {
      return this.cache;
    }

    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (result) => {
        if (result.settings) {
          // Merge with defaults to ensure new settings are included
          this.cache = this.deepMerge(DEFAULT_SETTINGS, result.settings);
        } else {
          this.cache = { ...DEFAULT_SETTINGS };
          // Save defaults on first run
          this.saveAll(this.cache);
        }
        resolve(this.cache);
      });
    });
  }

  /**
   * Get a specific setting by path (e.g., 'pacer.enabled')
   */
  async get(path) {
    const settings = await this.getAll();
    return path.split('.').reduce((obj, key) => obj?.[key], settings);
  }

  /**
   * Set a specific setting by path
   */
  async set(path, value) {
    const settings = await this.getAll();
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key], settings);
    target[lastKey] = value;
    
    await this.saveAll(settings);
    return settings;
  }

  /**
   * Save all settings
   */
  async saveAll(settings) {
    this.cache = settings;
    return new Promise((resolve) => {
      chrome.storage.local.set({ settings }, resolve);
    });
  }

  /**
   * Reset to default settings
   */
  async reset() {
    this.cache = { ...DEFAULT_SETTINGS };
    await this.saveAll(this.cache);
    return this.cache;
  }

  /**
   * Deep merge two objects
   */
  deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
      if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  /**
   * Listen for storage changes
   */
  onChange(callback) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.settings) {
        this.cache = changes.settings.newValue;
        callback(this.cache);
      }
    });
  }
}

// Create global instance
const storage = new StorageManager();

/**
 * Utility to detect platform
 */
const Platform = {
  isMac: navigator.platform.toUpperCase().indexOf('MAC') >= 0,
  
  getModifierSymbol(modifier) {
    const symbols = {
      'Alt': this.isMac ? '⌥' : 'Alt',
      'Shift': this.isMac ? '⇧' : 'Shift',
      'Ctrl': this.isMac ? '⌃' : 'Ctrl',
      'Meta': this.isMac ? '⌘' : 'Win'
    };
    return symbols[modifier] || modifier;
  },

  formatKeybinding(binding) {
    if (!binding) return '';
    const parts = binding.modifiers.map(m => this.getModifierSymbol(m));
    const keyDisplay = binding.key === ' ' ? 'Space' : binding.key.toUpperCase();
    parts.push(keyDisplay);
    return this.isMac ? parts.join('') : parts.join(' + ');
  }
};
