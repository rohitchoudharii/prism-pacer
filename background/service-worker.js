/**
 * Service Worker for Prism Pacer extension
 * Handles background tasks and extension lifecycle
 */

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Set default settings
    const defaultSettings = {
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
        convertToMarkdown: { key: 'm', modifiers: ['Alt', 'Shift'] }
      },
      stats: {
        totalWordsRead: 0,
        sessionsCompleted: 0,
        averageWpm: 0,
        lastSessionDate: null
      }
    };
    
    await chrome.storage.local.set({ settings: defaultSettings });
    console.log('Prism Pacer: Default settings initialized');
  }
  
  if (details.reason === 'update') {
    console.log('Prism Pacer: Extension updated to version', chrome.runtime.getManifest().version);
  }
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_TAB_STATE') {
    chrome.storage.local.get(['tabStates'], (result) => {
      const tabStates = result.tabStates || {};
      const tabId = message.tabId || sender.tab?.id;
      sendResponse(tabId ? tabStates[tabId] || {} : {});
    });
    return true;
  }

  if (message.type === 'SET_TAB_STATE') {
    chrome.storage.local.get(['tabStates'], async (result) => {
      const tabStates = result.tabStates || {};
      const tabId = message.tabId || sender.tab?.id;
      if (!tabId) {
        sendResponse({ success: false });
        return;
      }
      if (!tabStates[tabId]) {
        tabStates[tabId] = {};
      }
      tabStates[tabId][`${message.feature}Enabled`] = message.enabled;
      await chrome.storage.local.set({ tabStates });
      try {
        chrome.tabs.sendMessage(tabId, {
          type: 'TAB_STATE_CHANGED',
          tabId,
          feature: message.feature,
          enabled: message.enabled
        });
      } catch (e) {
        // Tab might not have content script
      }
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get(['settings'], (result) => {
      sendResponse(result.settings);
    });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'UPDATE_STATS') {
    chrome.storage.local.get(['settings'], async (result) => {
      const settings = result.settings;
      if (settings && settings.stats) {
        settings.stats.totalWordsRead += message.wordsRead || 0;
        settings.stats.sessionsCompleted += message.sessionCompleted ? 1 : 0;
        settings.stats.lastSessionDate = new Date().toISOString();
        await chrome.storage.local.set({ settings });
        sendResponse({ success: true });
      }
    });
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(['tabStates'], async (result) => {
    const tabStates = result.tabStates || {};
    if (tabStates[tabId]) {
      delete tabStates[tabId];
      await chrome.storage.local.set({ tabStates });
    }
  });
});

// Log when service worker starts
console.log('Prism Pacer: Service worker started');
