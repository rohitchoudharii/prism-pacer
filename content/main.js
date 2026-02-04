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
  let tabState = {};
  let cursorHidden = false;
  const tabStateRefreshMs = 10000;
  let lastTabStateCheck = 0;
  
  /**
   * Initialize the extension
   */
  async function init() {
    // Load settings
    settings = await loadSettings();
    await refreshTabState();
    
    // Initialize keybindings
    initKeybindings();
    
    // Apply initial state
    applySettings(settings);
    
    // Listen for settings changes from popup/storage
    chrome.storage.onChanged.addListener(handleStorageChange);
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(handleMessage);
    
    // Periodically refresh tab state (covers missed messages)
    setInterval(async () => {
      const now = Date.now();
      if (now - lastTabStateCheck >= tabStateRefreshMs) {
        lastTabStateCheck = now;
        await refreshTabState();
        applySettings(settings);
      }
    }, tabStateRefreshMs);

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
        decreaseOpacity: { key: '-', modifiers: ['Alt', 'Shift'] },
        toggleCursor: { key: 'c', modifiers: ['Alt', 'Shift'] },
        convertToMarkdown: { key: 'm', modifiers: ['Alt', 'Shift'] }
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
   * Get effective enabled state for a feature (per-tab or global default)
   */
  function getEffectiveEnabled(feature) {
    if (tabState && tabState[`${feature}Enabled`] !== undefined) {
      return tabState[`${feature}Enabled`];
    }
    return settings[feature].enabled;
  }
  
  /**
   * Save per-tab state for a feature
   */
  async function saveTabState(feature, enabled) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'SET_TAB_STATE',
        feature,
        enabled
      }, (response) => {
        resolve(response);
      });
    });
  }

  async function refreshTabState() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_TAB_STATE' }, (response) => {
        tabState = response || {};
        resolve(tabState);
      });
    });
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
      saveTabState('pacer', enabled);
    });
    
    keybindingManager.register('toggleDimmer', () => {
      const enabled = dimmer.toggle();
      toast.toggle('Page Dimmer', enabled);
      saveTabState('dimmer', enabled);
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
      saveTabState('pacer', newState);
      saveTabState('dimmer', newState);
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
      saveTabState('pacer', false);
      saveTabState('dimmer', false);
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
        settings.dimmer.windowHeight = Math.max(20, settings.dimmer.windowHeight - 10);
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

    keybindingManager.register('convertToMarkdown', () => {
      if (typeof TurndownService === 'undefined') {
        console.warn('Prism Pacer - Turndown not available');
        return;
      }

      startMarkdownPicker();
    });
  }

  const markdownPicker = {
    active: false,
    overlay: null,
    highlight: null,
    tooltip: null,
    lastTarget: null
  };

  const markdownPickerSelectors = [
    'article',
    'main',
    'section',
    'div',
    '#content',
    '.content',
    '.article',
    '.post',
    '.entry',
    '.story',
    '.readable'
  ];

  function startMarkdownPicker() {
    if (markdownPicker.active) {
      return;
    }

    markdownPicker.active = true;
    markdownPicker.overlay = createPickerOverlay();
    markdownPicker.highlight = createPickerHighlight();
    markdownPicker.tooltip = createPickerTooltip();
    document.body.appendChild(markdownPicker.overlay);
    document.body.appendChild(markdownPicker.highlight);
    document.body.appendChild(markdownPicker.tooltip);

    document.addEventListener('mousemove', handlePickerMouseMove, true);
    document.addEventListener('click', handlePickerClick, true);
    document.addEventListener('keydown', handlePickerKeydown, true);
  }

  function stopMarkdownPicker() {
    markdownPicker.active = false;
    markdownPicker.lastTarget = null;
    removePickerElement(markdownPicker.overlay);
    removePickerElement(markdownPicker.highlight);
    removePickerElement(markdownPicker.tooltip);
    markdownPicker.overlay = null;
    markdownPicker.highlight = null;
    markdownPicker.tooltip = null;

    document.removeEventListener('mousemove', handlePickerMouseMove, true);
    document.removeEventListener('click', handlePickerClick, true);
    document.removeEventListener('keydown', handlePickerKeydown, true);
  }

  function createPickerOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'prism-pacer-md-picker-overlay';
    overlay.style.cssText = [
      'position: fixed',
      'inset: 0',
      'background: rgba(15, 23, 42, 0.2)',
      'pointer-events: none',
      'z-index: 2147483646'
    ].join(';');
    return overlay;
  }

  function createPickerHighlight() {
    const highlight = document.createElement('div');
    highlight.className = 'prism-pacer-md-picker-highlight';
    highlight.style.cssText = [
      'position: fixed',
      'border: 2px solid #38bdf8',
      'box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2)',
      'background: rgba(56, 189, 248, 0.08)',
      'pointer-events: none',
      'z-index: 2147483647'
    ].join(';');
    return highlight;
  }

  function createPickerTooltip() {
    const tooltip = document.createElement('div');
    tooltip.className = 'prism-pacer-md-picker-tooltip';
    tooltip.style.cssText = [
      'position: fixed',
      'padding: 6px 10px',
      'background: rgba(15, 23, 42, 0.9)',
      'color: #e2e8f0',
      'font: 12px/1.3 system-ui, sans-serif',
      'border-radius: 6px',
      'pointer-events: none',
      'z-index: 2147483647',
      'transform: translate(8px, 8px)'
    ].join(';');
    return tooltip;
  }

  function removePickerElement(element) {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }

  function handlePickerMouseMove(event) {
    if (!markdownPicker.active) {
      return;
    }

    const target = findPickerTarget(event.target);
    markdownPicker.lastTarget = target;
    updatePickerHighlight(target);
    updatePickerTooltip(event, target);
  }

  function handlePickerClick(event) {
    if (!markdownPicker.active) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const target = markdownPicker.lastTarget;
    if (!target) {
      console.warn('Prism Pacer - No valid element selected');
      stopMarkdownPicker();
      return;
    }

    const clonedTarget = target.cloneNode(true);
    normalizeUrlsInElement(clonedTarget, document.baseURI);
    formatTablesInElement(clonedTarget);

    const turndownService = new TurndownService();
    if (window.turndownPluginGfm?.gfm) {
      turndownService.use(window.turndownPluginGfm.gfm);
    }
    turndownService.addRule('subscript', {
      filter: 'sub',
      replacement(content) {
        return content ? `<sub>${content}</sub>` : '';
      }
    });
    turndownService.addRule('superscript', {
      filter: 'sup',
      replacement(content) {
        return content ? `<sup>${content}</sup>` : '';
      }
    });
    const markdown = turndownService.turndown(clonedTarget);
    console.log('Prism Pacer - Markdown output:\n', markdown);
    stopMarkdownPicker();
  }

  function handlePickerKeydown(event) {
    if (!markdownPicker.active) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      stopMarkdownPicker();
    }
  }

  function findPickerTarget(element) {
    if (!element) {
      return null;
    }

    const selector = markdownPickerSelectors.join(',');
    const candidate = element.closest(selector);
    if (!candidate || candidate === document.body || candidate === document.documentElement) {
      return null;
    }

    const rect = candidate.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 80) {
      return null;
    }

    return candidate;
  }

  function updatePickerHighlight(target) {
    const highlight = markdownPicker.highlight;
    if (!highlight) {
      return;
    }

    if (!target) {
      highlight.style.display = 'none';
      return;
    }

    const rect = target.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.top = `${rect.top}px`;
    highlight.style.left = `${rect.left}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
  }

  function updatePickerTooltip(event, target) {
    const tooltip = markdownPicker.tooltip;
    if (!tooltip) {
      return;
    }

    if (!target) {
      tooltip.style.display = 'none';
      return;
    }

    const label = buildPickerLabel(target);
    tooltip.textContent = label;
    tooltip.style.display = 'block';
    tooltip.style.top = `${event.clientY}px`;
    tooltip.style.left = `${event.clientX}px`;
  }

  function buildPickerLabel(target) {
    const tag = target.tagName.toLowerCase();
    const id = target.id ? `#${target.id}` : '';
    const classList = target.classList.length ? `.${Array.from(target.classList).slice(0, 3).join('.')}` : '';
    return `${tag}${id}${classList}`;
  }

  function normalizeUrlsInElement(rootElement, baseUri) {
    const elements = rootElement.querySelectorAll('a[href], img[src], img[srcset], source[src], source[srcset]');
    elements.forEach((element) => {
      if (element.hasAttribute('href')) {
        const href = element.getAttribute('href');
        const normalized = normalizeUrl(href, baseUri);
        if (normalized) {
          element.setAttribute('href', normalized);
        }
      }

      if (element.hasAttribute('src')) {
        const src = element.getAttribute('src');
        const normalized = normalizeUrl(src, baseUri);
        if (normalized) {
          element.setAttribute('src', normalized);
        }
      }

      if (element.hasAttribute('srcset')) {
        const srcset = element.getAttribute('srcset');
        const normalized = normalizeSrcset(srcset, baseUri);
        if (normalized) {
          element.setAttribute('srcset', normalized);
        }
      }
    });
  }

  function formatTablesInElement(rootElement) {
    const cells = rootElement.querySelectorAll('table th, table td');
    cells.forEach((cell) => {
      cell.querySelectorAll('ul, ol').forEach((list) => {
        const items = Array.from(list.querySelectorAll('li'))
          .map((li) => normalizeCellText(li.textContent))
          .filter(Boolean);
        const inline = items.map((item) => `- ${item}`).join(' ');
        const span = document.createElement('span');
        span.textContent = inline;
        list.replaceWith(span);
      });

      cell.querySelectorAll('p').forEach((p) => {
        const span = document.createElement('span');
        span.textContent = normalizeCellText(p.textContent);
        p.replaceWith(span);
      });

      const normalized = normalizeCellText(cell.textContent);
      cell.textContent = normalized;
    });
  }

  function normalizeCellText(value) {
    if (!value || typeof value !== 'string') {
      return '';
    }

    return value
      .replace(/\s+/g, ' ')
      .replace(/\|/g, '\\|')
      .trim();
  }

  function normalizeUrl(value, baseUri) {
    if (!value || typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
      return trimmed;
    }

    try {
      return new URL(trimmed, baseUri).href;
    } catch (e) {
      return trimmed;
    }
  }

  function normalizeSrcset(value, baseUri) {
    if (!value || typeof value !== 'string') {
      return null;
    }

    const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean);
    const normalizedEntries = entries.map((entry) => {
      const parts = entry.split(/\s+/).filter(Boolean);
      if (parts.length === 0) {
        return entry;
      }
      const urlPart = parts[0];
      const descriptor = parts.slice(1).join(' ');
      const normalizedUrl = normalizeUrl(urlPart, baseUri) || urlPart;
      return descriptor ? `${normalizedUrl} ${descriptor}` : normalizedUrl;
    });

    return normalizedEntries.join(', ');
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
    
    if (message.type === 'TAB_STATE_CHANGED') {
      tabState = tabState || {};
      tabState[`${message.feature}Enabled`] = message.enabled;
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
