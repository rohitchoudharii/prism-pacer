/**
 * Keybinding Manager - Handles keyboard shortcuts for all features
 * Supports configurable keybindings with cross-platform compatibility
 */

class KeybindingManager {
  constructor() {
    this.bindings = {};
    this.actions = new Map();
    this.context = 'default'; // 'default' or 'rsvp'
    this.enabled = true;
    
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Initialize the keybinding manager
   */
  init(bindings) {
    this.bindings = bindings || {};
    document.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Update keybindings
   */
  updateBindings(bindings) {
    this.bindings = bindings;
  }

  /**
   * Register an action handler
   */
  register(actionName, handler) {
    this.actions.set(actionName, handler);
  }

  /**
   * Unregister an action handler
   */
  unregister(actionName) {
    this.actions.delete(actionName);
  }

  /**
   * Set the current context (for context-specific shortcuts)
   */
  setContext(context) {
    this.context = context;
  }

  /**
   * Enable keybinding handling
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable keybinding handling
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Handle keydown events
   */
  handleKeyDown(event) {
    if (!this.enabled) return;
    
    // Debug logging (remove in production)
    console.log('Prism Pacer - Key pressed:', {
      key: event.key,
      code: event.code,
      physicalKey: this.getPhysicalKey(event),
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey
    });
    
    // Find matching action
    const matchedAction = this.findMatchingAction(event);
    
    if (matchedAction) {
      console.log('Prism Pacer - Matched action:', matchedAction);
      const handler = this.actions.get(matchedAction);
      if (handler) {
        event.preventDefault();
        event.stopPropagation();
        handler(event);
      }
    }
  }

  /**
   * Find an action that matches the current key event
   */
  findMatchingAction(event) {
    for (const [actionName, binding] of Object.entries(this.bindings)) {
      if (this.matchesBinding(event, binding)) {
        // Check context
        if (binding.context && binding.context !== this.context) {
          continue;
        }
        return actionName;
      }
    }
    return null;
  }

  /**
   * Check if an event matches a binding
   */
  matchesBinding(event, binding) {
    if (!binding || !binding.key) return false;
    
    const bindingKey = binding.key.toLowerCase();
    
    // Get the physical key pressed using event.code
    // This fixes Mac where Option+Shift+P produces special characters like ∏
    let eventKey = this.getPhysicalKey(event);
    
    // Check if key matches
    if (eventKey !== bindingKey) {
      return false;
    }
    
    // Check modifiers
    const modifiers = binding.modifiers || [];
    
    const altRequired = modifiers.includes('Alt');
    const shiftRequired = modifiers.includes('Shift');
    const ctrlRequired = modifiers.includes('Ctrl');
    const metaRequired = modifiers.includes('Meta');
    
    // Check each modifier
    if (event.altKey !== altRequired) return false;
    if (event.shiftKey !== shiftRequired) return false;
    if (event.ctrlKey !== ctrlRequired) return false;
    if (event.metaKey !== metaRequired) return false;
    
    return true;
  }

  /**
   * Get the physical key from an event
   * Uses event.code to handle Mac Option key producing special characters
   */
  getPhysicalKey(event) {
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
      'Escape': 'escape',
      'ArrowUp': 'arrowup',
      'ArrowDown': 'arrowdown',
      'ArrowLeft': 'arrowleft',
      'ArrowRight': 'arrowright',
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
    return event.key.toLowerCase();
  }

  /**
   * Check for conflicts between bindings
   */
  hasConflict(newBinding, excludeAction = null) {
    for (const [actionName, binding] of Object.entries(this.bindings)) {
      if (actionName === excludeAction) continue;
      
      if (this.bindingsMatch(newBinding, binding)) {
        return actionName;
      }
    }
    return null;
  }

  /**
   * Check if two bindings are identical
   */
  bindingsMatch(a, b) {
    if (!a || !b) return false;
    if (a.key.toLowerCase() !== b.key.toLowerCase()) return false;
    
    const aModifiers = (a.modifiers || []).sort();
    const bModifiers = (b.modifiers || []).sort();
    
    if (aModifiers.length !== bModifiers.length) return false;
    
    return aModifiers.every((mod, i) => mod === bModifiers[i]);
  }

  /**
   * Destroy the manager
   */
  destroy() {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.actions.clear();
  }
}

// Create global instance
const keybindingManager = new KeybindingManager();
