/**
 * Visual Pacer - A horizontal line that follows the cursor
 * Helps guide the reader's eyes across the page
 * 
 * Features:
 * - Basic mode: Full-width line follows cursor Y position
 * - Smart mode: Detects text under cursor and underlines the full visual line
 *   (handles inline elements like <code>, <strong>, <a>, etc.)
 */

class Pacer {
  constructor() {
    this.element = null;
    this.enabled = false;
    this.settings = {
      height: 4,
      width: '100%',
      color: '#3b82f6',
      opacity: 0.6,
      offset: 0,
      smoothFollow: true,
      smartDetection: true,
      scrollFade: true  // true = fade animation, false = instant hide
    };
    
    // Position tracking
    this.currentY = 0;
    this.targetY = 0;
    this.animationFrame = null;
    
    // Smart detection state
    this.isOverText = false;
    this.lastTextRect = null;
    this.lastCheckTime = 0;
    this.throttleDelay = 30;  // 30ms between checks (~33/sec) - smoother
    
    // Target position for smooth interpolation (smart mode)
    this.targetRect = null;
    this.currentRect = { top: 0, left: 0, width: 0 };
    
    // Scroll handling state
    this.isScrolling = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    
    // Block elements that define line boundaries
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
    
    // Preformatted/code blocks
    this.preformattedTags = new Set(['PRE', 'CODE']);
    
    // Minimum line width to display (avoid tiny fragments)
    this.minLineWidth = 20;
    
    // Bind methods
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.animate = this.animate.bind(this);
    this.animateSmart = this.animateSmart.bind(this);
  }

  /**
   * Initialize the pacer element
   */
  init() {
    if (this.element) return;
    
    this.element = document.createElement('div');
    this.element.id = 'speed-reader-pacer';
    this.element.style.cssText = `
      position: fixed;
      left: 0;
      pointer-events: none;
      z-index: 2147483646;
      display: none;
    `;
    
    document.body.appendChild(this.element);
    this.applyStyles();
  }

  /**
   * Apply current settings to the pacer element
   */
  applyStyles() {
    if (!this.element) return;
    
    const { height, color, opacity, smartDetection } = this.settings;
    
    this.element.style.height = `${height}px`;
    this.element.style.backgroundColor = color;
    
    // Smoother transitions (0.2s for better feel)
    this.element.style.transition = 'opacity 0.2s ease-in-out, left 0.12s ease-out, width 0.12s ease-out, top 0.12s ease-out';
    
    // Only apply full width styles if NOT in smart detection mode
    if (!smartDetection) {
      const { width } = this.settings;
      this.element.style.width = typeof width === 'number' ? `${width}px` : width;
      this.element.style.opacity = opacity;
      
      // Center if width is not 100%
      if (width !== '100%') {
        this.element.style.left = '50%';
        this.element.style.transform = 'translateX(-50%)';
      } else {
        this.element.style.left = '0';
        this.element.style.transform = 'none';
      }
    }
  }

  /**
   * Update settings
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.applyStyles();
  }

  /**
   * Enable the pacer
   */
  enable() {
    if (this.enabled) return;
    
    this.init();
    this.enabled = true;
    this.element.style.display = 'block';
    
    // Reset smart detection state
    this.isOverText = false;
    this.lastTextRect = null;
    this.targetRect = null;
    this.currentRect = { top: 0, left: 0, width: 0 };
    
    // Reset scroll state
    this.isScrolling = false;
    
    document.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('scroll', this.handleScroll, { passive: true });
    
    // Start animation loop
    if (this.settings.smartDetection) {
      this.startSmartAnimation();
    } else if (this.settings.smoothFollow) {
      this.startAnimation();
    }
  }

  /**
   * Disable the pacer
   */
  disable() {
    if (!this.enabled) return;
    
    this.enabled = false;
    if (this.element) {
      this.element.style.display = 'none';
    }
    
    document.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('scroll', this.handleScroll);
    this.isScrolling = false;
    this.stopAnimation();
  }

  /**
   * Toggle the pacer
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
    // Always track mouse position
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    
    // Clear scroll flag on mouse move (scroll ended)
    if (this.isScrolling) {
      this.isScrolling = false;
      // If using instant hide, restore display
      if (!this.settings.scrollFade && this.element) {
        this.element.style.display = 'block';
      }
    }
    
    if (this.settings.smartDetection) {
      // Smart mode: detect text under cursor (throttled)
      const now = Date.now();
      if (now - this.lastCheckTime < this.throttleDelay) {
        return;
      }
      this.lastCheckTime = now;
      
      const textRect = this.detectTextLineAtPoint(e.clientX, e.clientY);
      
      if (textRect && textRect.width >= this.minLineWidth) {
        this.targetRect = textRect;
        this.isOverText = true;
      } else {
        this.targetRect = null;
        this.isOverText = false;
      }
    } else {
      // Classic mode: full-width line follows cursor Y
      this.targetY = e.clientY + this.settings.offset;
      
      if (!this.settings.smoothFollow) {
        this.currentY = this.targetY;
        this.updatePosition();
      }
    }
  }

  /**
   * Handle scroll events - hide pacer during scroll
   */
  handleScroll() {
    // Hide immediately when scroll starts
    if (!this.isScrolling) {
      this.isScrolling = true;
      this.hideForScroll();
    }
  }

  /**
   * Hide pacer during scroll
   */
  hideForScroll() {
    if (!this.element) return;
    
    if (this.settings.scrollFade) {
      // Fade out (uses CSS transition)
      this.element.style.opacity = '0';
    } else {
      // Instant hide
      this.element.style.display = 'none';
    }
    
    // Clear detection state
    this.isOverText = false;
    this.targetRect = null;
  }

  /**
   * Check if an element is interactive (should skip pacer)
   */
  isInteractiveElement(element) {
    if (!element) return false;
    
    // Check the element itself
    if (this.interactiveTags.has(element.tagName)) return true;
    
    // Check if element has click handlers or is focusable
    if (element.onclick || element.getAttribute('role') === 'button') return true;
    if (element.tabIndex >= 0 && element.tagName !== 'DIV' && element.tagName !== 'SPAN') return true;
    
    return false;
  }

  /**
   * Check if cursor is over an interactive element
   */
  isOverInteractiveElement(x, y) {
    const element = document.elementFromPoint(x, y);
    if (!element) return false;
    
    // Walk up to check if any ancestor is interactive
    let current = element;
    while (current && current !== document.body) {
      if (this.isInteractiveElement(current)) return true;
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
   * Check if element is a preformatted block (terminal, code)
   */
  isPreformattedBlock(element) {
    let current = element;
    while (current && current !== document.body) {
      if (this.preformattedTags.has(current.tagName)) {
        return true;
      }
      // Also check for common terminal/code classes
      if (current.classList) {
        const classes = current.className.toLowerCase();
        if (classes.includes('terminal') || classes.includes('console') || 
            classes.includes('code') || classes.includes('highlight')) {
          return true;
        }
      }
      current = current.parentElement;
    }
    return false;
  }

  /**
   * Detect text line at point using improved algorithm
   * Finds the full visual line across multiple inline elements
   */
  detectTextLineAtPoint(x, y) {
    // Skip if over interactive element
    if (this.isOverInteractiveElement(x, y)) {
      return null;
    }
    
    // Use caretRangeFromPoint to find text at coordinates
    let range;
    
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      // Firefox API
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset);
      }
    }
    
    if (!range) return null;
    
    const node = range.startContainer;
    
    // Must be a text node
    if (node.nodeType !== Node.TEXT_NODE) return null;
    
    // Skip if text is empty or whitespace only
    if (!node.textContent || node.textContent.trim().length === 0) return null;
    
    // Check if parent is editable (skip inputs/textareas)
    const parent = node.parentElement;
    if (parent) {
      if (parent.isContentEditable) return null;
      const tagName = parent.tagName.toUpperCase();
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SCRIPT' || tagName === 'STYLE') {
        return null;
      }
    }
    
    // Get reference position from caret
    const caretRect = this.getCaretRect(range, node);
    if (!caretRect || caretRect.height === 0) return null;
    
    // Find the block ancestor
    const block = this.getBlockAncestor(node);
    
    // Check if it's a preformatted block
    const isPreformatted = this.isPreformattedBlock(block);
    
    // Get the full visual line rect
    const lineRect = this.getVisualLineRect(block, caretRect.top, caretRect.height, isPreformatted);
    
    return lineRect;
  }

  /**
   * Get bounding rect for caret position
   */
  getCaretRect(caretRange, textNode) {
    const text = textNode.textContent;
    const caretOffset = caretRange.startOffset;
    
    try {
      const testRange = document.createRange();
      const safeOffset = Math.min(caretOffset, text.length - 1);
      testRange.setStart(textNode, Math.max(0, safeOffset));
      testRange.setEnd(textNode, Math.min(safeOffset + 1, text.length));
      return testRange.getBoundingClientRect();
    } catch (e) {
      return null;
    }
  }

  /**
   * Get the full visual line rect by examining all text nodes in the block
   * that are on the same visual line (same Y position)
   */
  getVisualLineRect(block, referenceY, referenceHeight, isPreformatted) {
    // Tolerance for Y position matching (half line height)
    const yTolerance = referenceHeight * 0.6;
    
    // Collect all rects on the same visual line
    const lineRects = [];
    
    // Use TreeWalker to iterate all text nodes
    const walker = document.createTreeWalker(
      block,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip empty/whitespace-only nodes
          if (!node.textContent || node.textContent.trim().length === 0) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip nodes inside interactive elements
          if (this.isInteractiveElement(node.parentElement)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    let textNode;
    while ((textNode = walker.nextNode())) {
      try {
        // Get rects for this text node (may span multiple lines)
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const rects = range.getClientRects();
        
        // Check each rect to see if it's on our target line
        for (const rect of rects) {
          if (rect.width === 0 || rect.height === 0) continue;
          
          // Check if this rect is on the same visual line
          const rectMidY = rect.top + rect.height / 2;
          const refMidY = referenceY + referenceHeight / 2;
          
          if (Math.abs(rectMidY - refMidY) <= yTolerance) {
            lineRects.push(rect);
          }
        }
      } catch (e) {
        // Skip problematic nodes
        continue;
      }
    }
    
    if (lineRects.length === 0) return null;
    
    // Combine all rects into a single bounding box
    let minLeft = Infinity;
    let maxRight = -Infinity;
    let minTop = Infinity;
    let maxBottom = -Infinity;
    
    for (const rect of lineRects) {
      minLeft = Math.min(minLeft, rect.left);
      maxRight = Math.max(maxRight, rect.right);
      minTop = Math.min(minTop, rect.top);
      maxBottom = Math.max(maxBottom, rect.bottom);
    }
    
    // For preformatted blocks, extend to the block's content width
    if (isPreformatted) {
      const blockRect = block.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(block);
      const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
      const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
      
      minLeft = blockRect.left + paddingLeft;
      maxRight = blockRect.right - paddingRight;
    }
    
    return new DOMRect(
      minLeft,
      minTop,
      maxRight - minLeft,
      maxBottom - minTop
    );
  }

  /**
   * Start smooth animation for smart mode
   */
  startSmartAnimation() {
    if (this.animationFrame) return;
    this.animateSmart();
  }

  /**
   * Animation loop for smart mode with smooth interpolation
   */
  animateSmart() {
    if (!this.enabled || !this.settings.smartDetection) return;
    
    const ease = 0.18;  // Slightly slower easing for smoother feel
    
    if (this.targetRect && this.isOverText) {
      // Smoothly interpolate to target position
      this.currentRect.top += (this.targetRect.top - this.currentRect.top) * ease;
      this.currentRect.left += (this.targetRect.left - this.currentRect.left) * ease;
      this.currentRect.width += (this.targetRect.width - this.currentRect.width) * ease;
      
      // Update element position
      const top = this.currentRect.top + (this.targetRect.height || 20) - this.settings.height / 2;
      
      this.element.style.top = `${top}px`;
      this.element.style.left = `${this.currentRect.left}px`;
      this.element.style.width = `${this.currentRect.width}px`;
      this.element.style.transform = 'none';
      this.element.style.opacity = this.settings.opacity;
      this.element.style.display = 'block';
    } else {
      // Fade out when not over text
      this.element.style.opacity = '0';
    }
    
    this.animationFrame = requestAnimationFrame(this.animateSmart);
  }

  /**
   * Update pacer to underline detected text line (direct, no interpolation)
   */
  updateForTextLine(rect) {
    if (!this.element) return;
    
    this.isOverText = true;
    this.lastTextRect = rect;
    
    // Position at bottom of text line (baseline)
    const top = rect.bottom - this.settings.height / 2;
    
    this.element.style.top = `${top}px`;
    this.element.style.left = `${rect.left}px`;
    this.element.style.width = `${rect.width}px`;
    this.element.style.transform = 'none';
    this.element.style.opacity = this.settings.opacity;
    this.element.style.display = 'block';
  }

  /**
   * Hide pacer when not over text (smart mode)
   */
  hideForNoText() {
    if (!this.element) return;
    
    this.isOverText = false;
    this.lastTextRect = null;
    this.element.style.opacity = '0';
  }

  /**
   * Update the pacer position (classic mode)
   */
  updatePosition() {
    if (!this.element) return;
    this.element.style.top = `${this.currentY - this.settings.height / 2}px`;
  }

  /**
   * Start smooth animation (classic mode only)
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
   * Animation loop for smooth following (classic mode)
   */
  animate() {
    if (!this.enabled || this.settings.smartDetection) return;
    
    // Smooth interpolation
    const ease = 0.15;
    this.currentY += (this.targetY - this.currentY) * ease;
    
    this.updatePosition();
    
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  /**
   * Destroy the pacer
   */
  destroy() {
    this.disable();
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }

  /**
   * Check if pacer is enabled
   */
  isEnabled() {
    return this.enabled;
  }
}

// Create global instance
const pacer = new Pacer();
