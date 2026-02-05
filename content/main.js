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
  let controlMode = 'mouse';
  let keyboardView = 'narrow';
  let pinnedElement = null;
  let keyboardPausedByMouse = false;
  let keyboardCacheDirty = false;
  let keyboardNavigationActive = false;
  let keyboardNavigationTimer = null;
  let lastPageTurnDirection = 0;
  let keyboardLastRect = null;
  let readingPin = {
    active: false,
    overlay: null,
    highlight: null,
    tooltip: null,
    lastTarget: null,
    requestedTarget: null
  };
  let keyboardCursor = {
    lineRects: [],
    lineIndex: -1,
    lineHeight: 0,
    lastScanTop: 0,
    lastScanBottom: 0
  };
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
      controlMode: {
        mode: 'mouse',
        keyboardView: 'narrow'
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
        reselectReadingElement: { key: 's', modifiers: ['Alt', 'Shift'] },
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
      if (controlMode === 'keyboard') {
        startKeyboardModeToggle('pacer');
        return;
      }

      const enabled = pacer.toggle();
      toast.toggle('Visual Pacer', enabled);
      saveTabState('pacer', enabled);
    });
    
    keybindingManager.register('toggleDimmer', () => {
      if (controlMode === 'keyboard') {
        startKeyboardModeToggle('dimmer');
        return;
      }

      const enabled = dimmer.toggle();
      toast.toggle('Page Dimmer', enabled);
      saveTabState('dimmer', enabled);
      // Auto-restore cursor when dimmer is disabled
      if (!enabled) {
        setCursorHidden(false);
      }
    });
    
    keybindingManager.register('toggleBoth', () => {
      if (controlMode === 'keyboard') {
        startKeyboardModeToggle('both');
        return;
      }

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

      cancelReadingPin();
      keyboardPausedByMouse = false;
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
      if (dimmer.isEnabled() && controlMode !== 'keyboard') {
        settings.dimmer.windowHeight = Math.min(200, settings.dimmer.windowHeight + 10);
        dimmer.updateSettings(settings.dimmer);
        toast.adjust('Window Height', `${settings.dimmer.windowHeight}px`);
        saveSetting('dimmer.windowHeight', settings.dimmer.windowHeight);
      }
    });
    
    keybindingManager.register('decreaseWindowHeight', () => {
      if (dimmer.isEnabled() && controlMode !== 'keyboard') {
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

    keybindingManager.register('reselectReadingElement', () => {
      if (controlMode !== 'keyboard') {
        toast.show('Enable keyboard mode first', '⚠', 1500);
        return;
      }

      if (!pacer.isEnabled() && !dimmer.isEnabled()) {
        toast.show('Enable pacer or dimmer first', '⚠', 1500);
        return;
      }

      if (readingPin.active) {
        return;
      }

      startReadingPin('both');
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

  const readingPinSelectors = [
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

  function startReadingPin(target) {
    if (readingPin.active) {
      return;
    }

    readingPin.active = true;
    readingPin.requestedTarget = target;
    readingPin.lastTarget = null;
    readingPin.overlay = createReadingPinOverlay();
    readingPin.highlight = createReadingPinHighlight();
    readingPin.tooltip = createReadingPinTooltip();
    document.body.appendChild(readingPin.overlay);
    document.body.appendChild(readingPin.highlight);
    document.body.appendChild(readingPin.tooltip);

    updateReadingPinTooltipLabel();

    document.addEventListener('mousemove', handleReadingPinMouseMove, true);
    document.addEventListener('click', handleReadingPinClick, true);
    document.addEventListener('keydown', handleReadingPinKeydown, true);
  }

  function cancelReadingPin() {
    if (!readingPin.active) {
      return;
    }

    readingPin.active = false;
    readingPin.lastTarget = null;
    readingPin.requestedTarget = null;
    removePickerElement(readingPin.overlay);
    removePickerElement(readingPin.highlight);
    removePickerElement(readingPin.tooltip);
    readingPin.overlay = null;
    readingPin.highlight = null;
    readingPin.tooltip = null;

    document.removeEventListener('mousemove', handleReadingPinMouseMove, true);
    document.removeEventListener('click', handleReadingPinClick, true);
    document.removeEventListener('keydown', handleReadingPinKeydown, true);
  }

  function createReadingPinOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'prism-pacer-reading-pin-overlay';
    overlay.style.cssText = [
      'position: fixed',
      'inset: 0',
      'background: rgba(8, 12, 22, 0.25)',
      'pointer-events: none',
      'z-index: 2147483646'
    ].join(';');
    return overlay;
  }

  function createReadingPinHighlight() {
    const highlight = document.createElement('div');
    highlight.className = 'prism-pacer-reading-pin-highlight';
    highlight.style.cssText = [
      'position: fixed',
      'border: 2px solid #38bdf8',
      'box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2)',
      'background: rgba(56, 189, 248, 0.08)',
      'pointer-events: none',
      'z-index: 2147483647',
      'display: none'
    ].join(';');
    return highlight;
  }

  function createReadingPinTooltip() {
    const tooltip = document.createElement('div');
    tooltip.className = 'prism-pacer-reading-pin-tooltip';
    tooltip.style.cssText = [
      'position: fixed',
      'padding: 6px 10px',
      'background: rgba(15, 23, 42, 0.95)',
      'color: #e2e8f0',
      'font: 12px/1.3 system-ui, sans-serif',
      'border-radius: 6px',
      'pointer-events: none',
      'z-index: 2147483647',
      'transform: translate(8px, 8px)'
    ].join(';');
    return tooltip;
  }

  function handleReadingPinMouseMove(event) {
    if (!readingPin.active) {
      return;
    }

    if (readingPin.tooltip) {
      readingPin.tooltip.style.transform = 'translate(8px, 8px)';
    }

    const target = findReadingPinTarget(event.target);
    readingPin.lastTarget = target;
    updateReadingPinHighlight(target);
    updateReadingPinTooltip(event, target);
  }

  function handleReadingPinClick(event) {
    if (!readingPin.active) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const target = readingPin.lastTarget;
    if (!target) {
      toast.show('Select a readable element', '⚠', 1500);
      return;
    }

    const requestedTarget = readingPin.requestedTarget || 'both';
    pinnedElement = target;
    cancelReadingPin();
    keyboardPausedByMouse = false;
    resetKeyboardCursor();
    enableKeyboardNarrow(requestedTarget);
    moveKeyboardLine(1, true);
  }

  function handleReadingPinKeydown(event) {
    if (!readingPin.active) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelReadingPin();
    }
  }

  function findReadingPinTarget(element) {
    if (!element) {
      return null;
    }

    const selector = readingPinSelectors.join(',');
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

  function updateReadingPinHighlight(target) {
    const highlight = readingPin.highlight;
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

  function updateReadingPinTooltip(event, target) {
    const tooltip = readingPin.tooltip;
    if (!tooltip) {
      return;
    }

    if (!target) {
      updateReadingPinTooltipLabel();
      return;
    }

    const label = buildPickerLabel(target);
    tooltip.textContent = `Select reading element: ${label}`;
    tooltip.style.display = 'block';
    tooltip.style.top = `${event.clientY}px`;
    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.transform = 'translate(8px, 8px)';
  }

  function updateReadingPinTooltipLabel() {
    const tooltip = readingPin.tooltip;
    if (!tooltip) return;
    tooltip.textContent = 'Select reading element';
    tooltip.style.display = 'block';
    tooltip.style.top = '12px';
    tooltip.style.left = '12px';
    tooltip.style.transform = 'none';
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

  function moveKeyboardLine(direction, forceInit = false) {
    if (controlMode !== 'keyboard') return;
    if (keyboardView === 'broad') return;
    if (readingPin.active) return;
    if (!pinnedElement) {
      startReadingPin('both');
      return;
    }

    keyboardNavigationActive = true;
    if (keyboardNavigationTimer) {
      clearTimeout(keyboardNavigationTimer);
    }
    keyboardNavigationTimer = setTimeout(() => {
      keyboardNavigationActive = false;
      keyboardNavigationTimer = null;
    }, 200);

    if (!document.body.contains(pinnedElement)) {
      if (pacer.isEnabled()) {
        pacer.hide();
      }
      if (dimmer.isEnabled()) {
        dimmer.hide();
      }
      pinnedElement = null;
      keyboardNavigationActive = false;
      if (keyboardNavigationTimer) {
        clearTimeout(keyboardNavigationTimer);
        keyboardNavigationTimer = null;
      }
      lastPageTurnDirection = 0;
      keyboardLastRect = null;
      toast.show('Reading element lost', '⚠', 1500);
      return;
    }

    if (!pacer.isEnabled() && !dimmer.isEnabled()) {
      enableKeyboardNarrow('both');
    }

    if (keyboardPausedByMouse) {
      keyboardPausedByMouse = false;
      if (pacer.isEnabled()) {
        pacer.show();
      }
      if (dimmer.isEnabled()) {
        dimmer.show();
      }
    }

    if (forceInit || keyboardCursor.lineRects.length === 0) {
      buildVisibleLineCache();
      if (keyboardCursor.lineRects.length === 0) {
        toast.show('No readable text in view', '⚠', 1500);
        keyboardNavigationActive = false;
        if (keyboardNavigationTimer) {
          clearTimeout(keyboardNavigationTimer);
          keyboardNavigationTimer = null;
        }
        return;
      }
      keyboardCacheDirty = false;
      if (!keyboardCacheDirty && keyboardLastRect) {
        keyboardCursor.lineIndex = findClosestLineIndex(keyboardLastRect);
      } else if (lastPageTurnDirection !== 0 && direction !== lastPageTurnDirection) {
        keyboardCursor.lineIndex = direction > 0 ? 0 : keyboardCursor.lineRects.length - 1;
        lastPageTurnDirection = 0;
      } else {
        keyboardCursor.lineIndex = direction >= 0 ? 0 : keyboardCursor.lineRects.length - 1;
      }
      updateKeyboardVisuals(keyboardCursor.lineRects[keyboardCursor.lineIndex]);
      return;
    }

    if (keyboardCacheDirty) {
      keyboardCacheDirty = false;
      buildVisibleLineCache();
      if (keyboardCursor.lineRects.length === 0) {
        toast.show('No readable text in view', '⚠', 1500);
        keyboardNavigationActive = false;
        if (keyboardNavigationTimer) {
          clearTimeout(keyboardNavigationTimer);
          keyboardNavigationTimer = null;
        }
        return;
      }
      if (lastPageTurnDirection !== 0 && direction !== lastPageTurnDirection) {
        keyboardCursor.lineIndex = direction > 0 ? 0 : keyboardCursor.lineRects.length - 1;
        lastPageTurnDirection = 0;
      } else {
        keyboardCursor.lineIndex = direction >= 0 ? 0 : keyboardCursor.lineRects.length - 1;
      }
      updateKeyboardVisuals(keyboardCursor.lineRects[keyboardCursor.lineIndex]);
      return;
    }

    const nextIndex = keyboardCursor.lineIndex + direction;
    if (nextIndex >= 0 && nextIndex < keyboardCursor.lineRects.length) {
      const nextRect = keyboardCursor.lineRects[nextIndex];
      const viewportHeight = window.innerHeight;
      const zoneTop = viewportHeight * 0.1;
      const zoneBottom = viewportHeight * 0.9;

      if (direction > 0 && nextRect.bottom >= zoneBottom) {
        pageTurn(1);
        return;
      }

      if (direction < 0 && nextRect.top <= zoneTop) {
        pageTurn(-1);
        return;
      }

      if (lastPageTurnDirection !== 0 && direction !== lastPageTurnDirection) {
        lastPageTurnDirection = 0;
      }
      keyboardCursor.lineIndex = nextIndex;
      updateKeyboardVisuals(keyboardCursor.lineRects[keyboardCursor.lineIndex]);
      return;
    }

    pageTurn(direction > 0 ? 1 : -1);
    return;
  }

  function pageTurn(direction) {
    if (!pinnedElement) return;

    lastPageTurnDirection = direction;
    const viewportHeight = window.innerHeight;
    const offset = Math.round(viewportHeight * 0.77) * direction;
    window.scrollBy({ top: offset, left: 0, behavior: 'auto' });
    resetKeyboardCursor();
    buildVisibleLineCache();
    if (keyboardCursor.lineRects.length === 0) {
      if (pacer.isEnabled()) {
        pacer.hide();
      }
      if (dimmer.isEnabled()) {
        dimmer.hide();
      }
      return;
    }
    keyboardCursor.lineIndex = direction > 0 ? 0 : keyboardCursor.lineRects.length - 1;
    updateKeyboardVisuals(keyboardCursor.lineRects[keyboardCursor.lineIndex]);
  }

  function updateKeyboardVisuals(rect) {
    if (!rect) return;
    const lineHeight = keyboardCursor.lineHeight || rect.height || 20;
    const centerY = rect.top + rect.height / 2;
    const padding = 6;
    const targetHeight = Math.max(20, Math.min(200, rect.height + padding));

    if (pacer.isEnabled()) {
      pacer.show();
      if (pacer.element) {
        pacer.element.style.top = `${rect.bottom - settings.pacer.height / 2}px`;
        pacer.element.style.left = `${rect.left}px`;
        pacer.element.style.width = `${rect.width}px`;
        pacer.element.style.transform = 'none';
        pacer.element.style.opacity = settings.pacer.opacity;
      }
    }

    if (dimmer.isEnabled()) {
      dimmer.show();
      dimmer.settings.windowHeight = targetHeight;
      dimmer.currentY = centerY;
      dimmer.targetY = centerY;

      if (dimmer.settings.focusedBox && pinnedElement) {
        const pinRect = pinnedElement.getBoundingClientRect();
        dimmer.isOverBlock = true;
        dimmer.targetLeft = pinRect.left;
        dimmer.targetWidth = pinRect.width;
      }

      dimmer.updatePosition();
    }

    keyboardCursor.lineHeight = lineHeight;
    keyboardLastRect = rect;
  }

  function buildVisibleLineCache() {
    if (!pinnedElement) return;

    const rect = pinnedElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const zoneTop = viewportHeight * 0.1;
    const zoneBottom = viewportHeight * 0.9;
    const viewTop = Math.max(zoneTop, rect.top);
    const viewBottom = Math.min(zoneBottom, rect.bottom);
    if (viewBottom <= viewTop) {
      keyboardCursor.lineRects = [];
      return;
    }

    const buffer = 80;
    const scanTop = Math.max(rect.top, viewTop - buffer);
    const scanBottom = Math.min(rect.bottom, viewBottom + buffer);

    const lineRects = [];
    const walker = document.createTreeWalker(
      pinnedElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node.textContent || node.textContent.trim().length === 0) {
            return NodeFilter.FILTER_REJECT;
          }
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (isInteractiveElement(parent)) return NodeFilter.FILTER_REJECT;
          if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toUpperCase();
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'INPUT' || tag === 'TEXTAREA') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let textNode;
    while ((textNode = walker.nextNode())) {
      try {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const rects = range.getClientRects();
        for (const lineRect of rects) {
          if (lineRect.width < 20 || lineRect.height === 0) continue;
          if (lineRect.bottom < scanTop || lineRect.top > scanBottom) continue;
          if (lineRect.top < viewTop - 4 || lineRect.bottom > viewBottom + 4) continue;
          lineRects.push(lineRect);
        }
      } catch (e) {
        continue;
      }
    }

    const sorted = lineRects.sort((a, b) => a.top - b.top || a.left - b.left);
    const groups = [];

    for (const lineRect of sorted) {
      const lineMid = lineRect.top + lineRect.height / 2;
      let group = null;

      for (const candidate of groups) {
        const candidateMid = (candidate.top + candidate.bottom) / 2;
        const tolerance = Math.max(2, lineRect.height * 0.6);
        if (Math.abs(candidateMid - lineMid) <= tolerance) {
          group = candidate;
          break;
        }
      }

      if (!group) {
        group = {
          top: lineRect.top,
          bottom: lineRect.bottom,
          left: lineRect.left,
          right: lineRect.right
        };
        groups.push(group);
      } else {
        group.top = Math.min(group.top, lineRect.top);
        group.bottom = Math.max(group.bottom, lineRect.bottom);
        group.left = Math.min(group.left, lineRect.left);
        group.right = Math.max(group.right, lineRect.right);
      }
    }

    const merged = groups
      .map((group) => new DOMRect(group.left, group.top, group.right - group.left, group.bottom - group.top))
      .filter((rect) => rect.width >= 20 && rect.height > 0)
      .sort((a, b) => a.top - b.top || a.left - b.left);

    keyboardCursor.lineRects = merged;
    keyboardCursor.lastScanTop = scanTop;
    keyboardCursor.lastScanBottom = scanBottom;
  }

  function findClosestLineIndex(rect) {
    if (!rect || keyboardCursor.lineRects.length === 0) {
      return 0;
    }

    const targetY = rect.top + rect.height / 2;
    let bestIndex = 0;
    let bestDistance = Infinity;

    keyboardCursor.lineRects.forEach((lineRect, index) => {
      const lineY = lineRect.top + lineRect.height / 2;
      const distance = Math.abs(lineY - targetY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }

  function isInteractiveElement(element) {
    if (!element) return false;
    const tagName = element.tagName?.toUpperCase();
    if (!tagName) return false;
    if (tagName === 'A' || tagName === 'BUTTON' || tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA' || tagName === 'LABEL') {
      return true;
    }
    if (element.onclick || element.getAttribute?.('role') === 'button') return true;
    if (element.tabIndex >= 0 && tagName !== 'DIV' && tagName !== 'SPAN') return true;
    return false;
  }

  function isEditableTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tagName = target.tagName?.toUpperCase();
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
      return true;
    }
    return false;
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
    controlMode = settings.controlMode?.mode || 'mouse';
    keyboardView = settings.controlMode?.keyboardView || 'narrow';
    applyControlMode();

    // Update pacer
    pacer.updateSettings(settings.pacer);
    if (controlMode === 'keyboard' && keyboardView === 'broad') {
      pacer.disable();
    } else if (controlMode === 'keyboard' && !pinnedElement) {
      pacer.disable();
    } else if (getEffectiveEnabled('pacer')) {
      pacer.enable();
    } else {
      pacer.disable();
    }
    
    // Update dimmer
    dimmer.updateSettings(settings.dimmer);
    if (controlMode === 'keyboard' && keyboardView === 'broad') {
      dimmer.disable();
      setCursorHidden(false);
    } else if (controlMode === 'keyboard' && !pinnedElement) {
      dimmer.disable();
      setCursorHidden(false);
    } else if (getEffectiveEnabled('dimmer')) {
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

  function applyControlMode() {
    pacer.setControlMode(controlMode);
    dimmer.setControlMode(controlMode);

    if (controlMode === 'keyboard') {
      document.addEventListener('mousemove', handleKeyboardModeMouseMove, { passive: true });
      window.addEventListener('scroll', handleKeyboardModeScroll, { passive: true });
      document.addEventListener('keydown', handleKeyboardModeArrowKeys, true);
      if (keyboardView === 'broad') {
        pacer.disable();
        dimmer.disable();
        setCursorHidden(false);
      }
    } else {
      document.removeEventListener('mousemove', handleKeyboardModeMouseMove);
      window.removeEventListener('scroll', handleKeyboardModeScroll);
      document.removeEventListener('keydown', handleKeyboardModeArrowKeys, true);
      cancelReadingPin();
      keyboardPausedByMouse = false;
      resetKeyboardCursor();
      pinnedElement = null;
      lastPageTurnDirection = 0;
      keyboardLastRect = null;
    }
  }

  function handleKeyboardModeArrowKeys(event) {
    if (controlMode !== 'keyboard') return;
    if (keyboardView === 'broad') return;
    if (readingPin.active) return;
    if (rsvpPlayer.isActive()) return;
    if (!pacer.isEnabled() && !dimmer.isEnabled()) return;
    if (event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
    if (isEditableTarget(event.target)) return;

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      moveKeyboardLine(-1);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      moveKeyboardLine(1);
    }
  }

  function getKeyboardView() {
    return keyboardView;
  }

  function startKeyboardModeToggle(target) {
    if (keyboardView === 'broad') {
      pacer.disable();
      dimmer.disable();
      toast.toggle('Pacer + Dimmer', false);
      saveTabState('pacer', false);
      saveTabState('dimmer', false);
      return;
    }

    if (target === 'pacer') {
      if (pacer.isEnabled()) {
        pacer.disable();
        toast.toggle('Visual Pacer', false);
        saveTabState('pacer', false);
        return;
      }

      if (pinnedElement) {
        enableKeyboardNarrow('pacer');
        return;
      }

      startReadingPin('pacer');
      return;
    }

    if (target === 'dimmer') {
      if (dimmer.isEnabled()) {
        dimmer.disable();
        setCursorHidden(false);
        toast.toggle('Page Dimmer', false);
        saveTabState('dimmer', false);
        return;
      }

      if (pinnedElement) {
        enableKeyboardNarrow('dimmer');
        return;
      }

      startReadingPin('dimmer');
      return;
    }

    if (target === 'both') {
      const shouldEnable = !(pacer.isEnabled() || dimmer.isEnabled());
      if (!shouldEnable) {
        pacer.disable();
        dimmer.disable();
        toast.toggle('Pacer + Dimmer', false);
        saveTabState('pacer', false);
        saveTabState('dimmer', false);
        return;
      }
    }

    if (pinnedElement) {
      enableKeyboardNarrow(target);
      return;
    }

    startReadingPin(target);
  }

  function enableKeyboardNarrow(target) {
    if (target === 'pacer') {
      pacer.enable();
      toast.toggle('Visual Pacer', true);
      saveTabState('pacer', true);
      return;
    }

    if (target === 'dimmer') {
      dimmer.enable();
      toast.toggle('Page Dimmer', true);
      saveTabState('dimmer', true);
      return;
    }

    pacer.enable();
    dimmer.enable();
    toast.toggle('Pacer + Dimmer', true);
    saveTabState('pacer', true);
    saveTabState('dimmer', true);
  }

  function resetKeyboardCursor() {
    keyboardCursor = {
      lineRects: [],
      lineIndex: -1,
      lineHeight: 0,
      lastScanTop: 0,
      lastScanBottom: 0
    };
    keyboardCacheDirty = false;
    keyboardLastRect = null;
  }

  function handleKeyboardModeMouseMove() {
    if (controlMode !== 'keyboard') return;
    if (!pacer.isEnabled() && !dimmer.isEnabled()) return;
    if (keyboardView === 'broad') return;

    keyboardPausedByMouse = true;
    if (pacer.isEnabled()) {
      pacer.hide();
    }
    if (dimmer.isEnabled()) {
      dimmer.hide();
    }
  }

  function handleKeyboardModeScroll() {
    if (controlMode !== 'keyboard') return;
    if (!pacer.isEnabled() && !dimmer.isEnabled()) return;
    if (keyboardView === 'broad') return;
    if (keyboardNavigationActive) return;

    keyboardPausedByMouse = true;
    keyboardCacheDirty = true;
    if (pacer.isEnabled()) {
      pacer.hide();
    }
    if (dimmer.isEnabled()) {
      dimmer.hide();
    }
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

      if (controlMode === 'keyboard' && message.enabled && !pinnedElement && keyboardView !== 'broad') {
        startReadingPin(message.feature);
      }

      sendResponse({ success: true });
    }

    if (message.type === 'SESSION_CONTROL_MODE') {
      controlMode = message.mode || 'mouse';
      keyboardView = message.keyboardView || 'narrow';
      applyControlMode();
      sendResponse({ success: true });
    }
    
    if (message.type === 'GET_STATE') {
      sendResponse({
        pacerEnabled: pacer.isEnabled(),
        dimmerEnabled: dimmer.isEnabled(),
        rsvpActive: rsvpPlayer.isActive(),
        controlMode: controlMode,
        keyboardView: keyboardView
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
