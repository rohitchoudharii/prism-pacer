/**
 * Toast notifications for visual feedback
 * Shows temporary messages when settings change or features toggle
 */

class Toast {
  constructor() {
    this.container = null;
    this.timeout = null;
  }

  /**
   * Initialize the toast container
   */
  init() {
    if (this.container) return;
    
    this.container = document.createElement('div');
    this.container.id = 'speed-reader-toast';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(-100px);
      background: #18181b;
      color: #e4e4e7;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      border: 1px solid #27272a;
      z-index: 2147483647;
      transition: transform 0.3s ease-out, opacity 0.3s ease-out;
      opacity: 0;
      pointer-events: none;
      display: flex;
      align-items: center;
      gap: 10px;
    `;
    
    document.body.appendChild(this.container);
  }

  /**
   * Show a toast message
   */
  show(message, icon = '', duration = 2000) {
    this.init();
    
    // Clear existing timeout
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    
    // Set content
    this.container.innerHTML = icon ? `<span>${icon}</span><span>${message}</span>` : message;
    
    // Show toast
    requestAnimationFrame(() => {
      this.container.style.transform = 'translateX(-50%) translateY(0)';
      this.container.style.opacity = '1';
    });
    
    // Hide after duration
    this.timeout = setTimeout(() => {
      this.hide();
    }, duration);
  }

  /**
   * Hide the toast
   */
  hide() {
    if (!this.container) return;
    
    this.container.style.transform = 'translateX(-50%) translateY(-100px)';
    this.container.style.opacity = '0';
  }

  /**
   * Show success toast
   */
  success(message, duration = 2000) {
    this.show(message, '✓', duration);
  }

  /**
   * Show info toast
   */
  info(message, duration = 2000) {
    this.show(message, 'ℹ', duration);
  }

  /**
   * Show feature toggle toast
   */
  toggle(feature, enabled, duration = 1500) {
    const icon = enabled ? '✓' : '✗';
    const status = enabled ? 'ON' : 'OFF';
    this.show(`${feature}: ${status}`, icon, duration);
  }

  /**
   * Show setting adjustment toast
   */
  adjust(setting, value, duration = 1500) {
    this.show(`${setting}: ${value}`, '⚙', duration);
  }

  /**
   * Destroy the toast
   */
  destroy() {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}

// Create global instance
const toast = new Toast();
