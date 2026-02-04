/**
 * Page Dimmer - Creates a focused reading window
 * 
 * Two modes:
 * - Banner mode: Traditional top/bottom overlays (full width)
 * - Focused Box mode: Adaptive box that matches parent block width
 */

class Dimmer {
  constructor() {
    // Banner mode elements
    this.topOverlay = null;
    this.bottomOverlay = null;
    
    // Focused box mode element
    this.focusBox = null;
    
    this.enabled = false;
    this.settings = {
      opacity: 0.7,
      color: '#000000',
      windowHeight: 60,
      transitionSpeed: 100,
      scrollFade: true,
      focusedBox: false  // true = adaptive focused box, false = full-width banner
    };
    
    // Position tracking
    this.currentY = 0;
    this.targetY = 0;
    this.currentLeft = 0;
    this.targetLeft = 0;
    this.currentWidth = 0;
    this.targetWidth = 0;
    this.animationFrame = null;
    
    // Scroll handling state
    this.isScrolling = false;
    
    // Detection state (for focused box mode)
    this.isOverBlock = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    
    // Block elements that define boundaries (same as pacer)
    this.blockTags = new Set([
      'P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
      'PRE', 'BLOCKQUOTE', 'TD', 'TH', 'ARTICLE', 'SECTION',
      'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'MAIN', 'DD', 'DT',
      'FIGCAPTION', 'FIGURE', 'ADDRESS'
    ]);
    
    // Interactive elements to skip
    this.interactiveTags = new Set([
      'A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'
    ]);
    
    // Bind methods
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.animate = this.animate.bind(this);
  }

  /**
   * Initialize the dimmer elements based on mode
   */
  init() {
    if (this.settings.focusedBox) {
      this.initFocusBox();
    } else {
      this.initBannerMode();
    }
  }

  /**
   * Initialize banner mode overlays (traditional)
   */
  initBannerMode() {
    if (this.topOverlay) return;
    
    // Create top overlay
    this.topOverlay = document.createElement('div');
    this.topOverlay.id = 'speed-reader-dimmer-top';
    this.topOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      pointer-events: none;
      z-index: 2147483645;
      display: none;
    `;
    
    // Create bottom overlay
    this.bottomOverlay = document.createElement('div');
    this.bottomOverlay.id = 'speed-reader-dimmer-bottom';
    this.bottomOverlay.style.cssText = `
      position: fixed;
      left: 0;
      width: 100%;
      bottom: 0;
      pointer-events: none;
      z-index: 2147483645;
      display: none;
    `;
    
    document.body.appendChild(this.topOverlay);
    document.body.appendChild(this.bottomOverlay);
    
    this.applyBannerStyles();
  }

  /**
   * Initialize focused box mode element
   */
  initFocusBox() {
    if (this.focusBox) return;
    
    this.focusBox = document.createElement('div');
    this.focusBox.id = 'speed-reader-focus-box';
    this.focusBox.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483645;
      display: none;
      background: transparent;
      border-radius: 6px;
    `;
    
    document.body.appendChild(this.focusBox);
    this.applyFocusBoxStyles();
  }

  /**
   * Apply styles to banner mode overlays
   */
  applyBannerStyles() {
    if (!this.topOverlay || !this.bottomOverlay) return;
    
    const { opacity, color, transitionSpeed } = this.settings;
    
    const commonStyles = `
      background-color: ${color};
      opacity: ${opacity};
      transition: height ${transitionSpeed}ms ease-out, opacity 0.2s ease-in-out;
    `;
    
    this.topOverlay.style.cssText += commonStyles;
    this.bottomOverlay.style.cssText += commonStyles;
  }

  /**
   * Apply styles to focused box
   */
  applyFocusBoxStyles() {
    if (!this.focusBox) return;
    
    const { opacity, color, transitionSpeed } = this.settings;
    
    // Calculate shadow color with opacity
    const shadowColor = this.hexToRgba(color, opacity);
    
    this.focusBox.style.boxShadow = `0 0 0 9999px ${shadowColor}`;
    this.focusBox.style.transition = `
      top ${transitionSpeed}ms ease-out,
      left 0.12s ease-out,
      width 0.12s ease-out,
      height ${transitionSpeed}ms ease-out,
      opacity 0.2s ease-in-out,
      box-shadow 0.2s ease-in-out
    `;
  }

  /**
   * Convert hex color to rgba
   */
  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Apply current settings
   */
  applyStyles() {
    if (this.settings.focusedBox) {
      this.applyFocusBoxStyles();
    } else {
      this.applyBannerStyles();
    }
  }

  /**
   * Update settings
   */
  updateSettings(newSettings) {
    const modeChanged = newSettings.focusedBox !== undefined && 
                        newSettings.focusedBox !== this.settings.focusedBox;
    
    this.settings = { ...this.settings, ...newSettings };
    
    // If mode changed while enabled, reinitialize
    if (modeChanged && this.enabled) {
      this.disable();
      this.destroyElements();
      this.enable();
    } else {
      this.applyStyles();
      if (this.enabled) {
        this.updatePosition();
      }
    }
  }

  /**
   * Destroy all DOM elements
   */
  destroyElements() {
    if (this.topOverlay) {
      this.topOverlay.remove();
      this.topOverlay = null;
    }
    if (this.bottomOverlay) {
      this.bottomOverlay.remove();
      this.bottomOverlay = null;
    }
    if (this.focusBox) {
      this.focusBox.remove();
      this.focusBox = null;
    }
  }

  /**
   * Enable the dimmer
   */
  enable() {
    if (this.enabled) return;
    
    this.init();
    this.enabled = true;
    
    if (this.settings.focusedBox) {
      // Focus box mode - start hidden until we detect a block
      this.focusBox.style.display = 'block';
      this.focusBox.style.opacity = '0';
      this.isOverBlock = false;
    } else {
      // Banner mode
      this.topOverlay.style.display = 'block';
      this.bottomOverlay.style.display = 'block';
    }
    
    // Set initial position to center of screen
    this.currentY = window.innerHeight / 2;
    this.targetY = this.currentY;
    this.currentLeft = 0;
    this.targetLeft = 0;
    this.currentWidth = window.innerWidth;
    this.targetWidth = this.currentWidth;
    
    if (!this.settings.focusedBox) {
      this.updatePosition();
    }
    
    // Reset scroll state
    this.isScrolling = false;
    
    document.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('scroll', this.handleScroll, { passive: true });
    this.startAnimation();
  }

  /**
   * Disable the dimmer
   */
  disable() {
    if (!this.enabled) return;
    
    this.enabled = false;
    
    if (this.topOverlay) {
      this.topOverlay.style.display = 'none';
    }
    if (this.bottomOverlay) {
      this.bottomOverlay.style.display = 'none';
    }
    if (this.focusBox) {
      this.focusBox.style.display = 'none';
    }
    
    document.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('scroll', this.handleScroll);
    this.isScrolling = false;
    this.stopAnimation();
  }

  /**
   * Toggle the dimmer
   */
  toggle() {
    if (this.enabled) {
      this.disable();
    } else {
      this.enable();
    }
    return this.enabled;
  }

  /**
   * Handle mouse movement
   */
  handleMouseMove(e) {
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.targetY = e.clientY;
    
    // If scrolling just ended, re-show dimmer
    if (this.isScrolling) {
      this.isScrolling = false;
      this.showAfterScroll();
    }
    
    // Focused box mode: detect block under cursor
    if (this.settings.focusedBox) {
      this.detectBlockAtPoint(e.clientX, e.clientY);
    }
  }

  /**
   * Detect block element at cursor position (for focused box mode)
   */
  detectBlockAtPoint(x, y) {
    // Check if over interactive element - hide if so
    if (this.isOverInteractiveElement(x, y)) {
      this.isOverBlock = false;
      return;
    }
    
    const element = document.elementFromPoint(x, y);
    if (!element || element === document.body || element === document.documentElement) {
      this.isOverBlock = false;
      return;
    }
    
    // Find the block ancestor
    const block = this.getBlockAncestor(element);
    if (!block || block === document.body) {
      this.isOverBlock = false;
      return;
    }
    
    // Get block rect
    const rect = block.getBoundingClientRect();
    
    // Validate rect
    if (rect.width < 50 || rect.height < 20) {
      this.isOverBlock = false;
      return;
    }
    
    this.isOverBlock = true;
    this.targetLeft = rect.left;
    this.targetWidth = rect.width;
  }

  /**
   * Check if cursor is over an interactive element
   */
  isOverInteractiveElement(x, y) {
    const element = document.elementFromPoint(x, y);
    if (!element) return false;
    
    let current = element;
    while (current && current !== document.body) {
      if (this.interactiveTags.has(current.tagName)) return true;
      if (current.onclick || current.getAttribute('role') === 'button') return true;
      current = current.parentElement;
    }
    
    return false;
  }

  /**
   * Find the nearest block-level ancestor
   */
  getBlockAncestor(node) {
    let current = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    
    while (current && current !== document.body) {
      if (this.blockTags.has(current.tagName)) {
        return current;
      }
      current = current.parentElement;
    }
    
    return document.body;
  }

  /**
   * Handle scroll events - hide dimmer during scroll
   */
  handleScroll() {
    if (!this.isScrolling) {
      this.isScrolling = true;
      this.hideForScroll();
    }
  }

  /**
   * Hide dimmer during scroll
   */
  hideForScroll() {
    if (this.settings.focusedBox) {
      if (!this.focusBox) return;
      
      if (this.settings.scrollFade) {
        this.focusBox.style.opacity = '0';
      } else {
        this.focusBox.style.display = 'none';
      }
    } else {
      if (!this.topOverlay || !this.bottomOverlay) return;
      
      if (this.settings.scrollFade) {
        this.topOverlay.style.opacity = '0';
        this.bottomOverlay.style.opacity = '0';
      } else {
        this.topOverlay.style.display = 'none';
        this.bottomOverlay.style.display = 'none';
      }
    }
  }

  /**
   * Show dimmer after scroll ends
   */
  showAfterScroll() {
    if (!this.enabled) return;
    
    if (this.settings.focusedBox) {
      if (!this.focusBox) return;
      
      // Only show if over a block
      if (this.isOverBlock) {
        if (this.settings.scrollFade) {
          this.focusBox.style.opacity = '1';
        } else {
          this.focusBox.style.display = 'block';
        }
      }
    } else {
      if (!this.topOverlay || !this.bottomOverlay) return;
      
      const { opacity } = this.settings;
      
      if (this.settings.scrollFade) {
        this.topOverlay.style.opacity = opacity;
        this.bottomOverlay.style.opacity = opacity;
      } else {
        this.topOverlay.style.display = 'block';
        this.bottomOverlay.style.display = 'block';
      }
    }
  }

  /**
   * Update position based on mode
   */
  updatePosition() {
    if (this.settings.focusedBox) {
      this.updateFocusBoxPosition();
    } else {
      this.updateBannerPosition();
    }
  }

  /**
   * Update banner mode overlay positions
   */
  updateBannerPosition() {
    if (!this.topOverlay || !this.bottomOverlay) return;
    
    const { windowHeight } = this.settings;
    const halfWindow = windowHeight / 2;
    const viewportHeight = window.innerHeight;
    
    const topHeight = Math.max(0, this.currentY - halfWindow);
    const bottomHeight = Math.max(0, viewportHeight - (this.currentY + halfWindow));
    
    this.topOverlay.style.height = `${topHeight}px`;
    this.bottomOverlay.style.height = `${bottomHeight}px`;
  }

  /**
   * Update focused box position
   */
  updateFocusBoxPosition() {
    if (!this.focusBox) return;
    
    const { windowHeight } = this.settings;
    const halfWindow = windowHeight / 2;
    
    // Calculate box position
    const top = this.currentY - halfWindow;
    const height = windowHeight;
    
    this.focusBox.style.top = `${top}px`;
    this.focusBox.style.left = `${this.currentLeft}px`;
    this.focusBox.style.width = `${this.currentWidth * 1.05}px`;
    this.focusBox.style.height = `${height}px`;
    
    // Show/hide based on detection
    if (this.isOverBlock && !this.isScrolling) {
      this.focusBox.style.opacity = '1';
    } else {
      this.focusBox.style.opacity = '0';
    }
  }

  /**
   * Start smooth animation
   */
  startAnimation() {
    if (this.animationFrame) return;
    this.animate();
  }

  /**
   * Stop animation
   */
  stopAnimation() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Animation loop for smooth following
   */
  animate() {
    if (!this.enabled) return;
    
    const ease = 0.12;
    
    // Interpolate Y position
    this.currentY += (this.targetY - this.currentY) * ease;
    
    // Interpolate X position and width (for focused box mode)
    if (this.settings.focusedBox) {
      this.currentLeft += (this.targetLeft - this.currentLeft) * ease;
      this.currentWidth += (this.targetWidth - this.currentWidth) * ease;
    }
    
    this.updatePosition();
    
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  /**
   * Destroy the dimmer
   */
  destroy() {
    this.disable();
    this.destroyElements();
  }

  /**
   * Check if dimmer is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get the reading window boundaries
   */
  getWindowBounds() {
    const { windowHeight } = this.settings;
    const halfWindow = windowHeight / 2;
    return {
      top: this.currentY - halfWindow,
      bottom: this.currentY + halfWindow,
      height: windowHeight,
      left: this.currentLeft,
      width: this.currentWidth
    };
  }
}

// Create global instance
const dimmer = new Dimmer();
