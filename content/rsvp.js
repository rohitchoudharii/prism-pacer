/**
 * RSVP (Rapid Serial Visual Presentation) Mode
 * Displays text word-by-word at a configurable speed
 */

class RSVPPlayer {
  constructor() {
    this.overlay = null;
    this.wordDisplay = null;
    this.progressBar = null;
    this.speedDisplay = null;
    this.controlsContainer = null;
    
    this.words = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.intervalId = null;
    
    this.settings = {
      wpm: 300,
      chunkSize: 1,
      fontSize: 32,
      fontFamily: 'system-ui',
      pauseOnPunctuation: true,
      backgroundColor: '#1a1a1a',
      textColor: '#ffffff'
    };
    
    this.onComplete = null;
    this.onExit = null;
  }

  /**
   * Initialize the RSVP overlay
   */
  init() {
    if (this.overlay) return;
    
    // Create overlay container
    this.overlay = document.createElement('div');
    this.overlay.id = 'speed-reader-rsvp';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: none;
      justify-content: center;
      align-items: center;
      flex-direction: column;
      z-index: 2147483647;
      font-family: ${this.settings.fontFamily}, -apple-system, BlinkMacSystemFont, sans-serif;
    `;
    
    // Create main content area
    const content = document.createElement('div');
    content.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 40px;
      padding: 40px;
      max-width: 800px;
      width: 100%;
    `;
    
    // Word display area
    this.wordDisplay = document.createElement('div');
    this.wordDisplay.style.cssText = `
      font-size: ${this.settings.fontSize}px;
      color: ${this.settings.textColor};
      font-weight: 500;
      min-height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      line-height: 1.4;
    `;
    
    // Progress bar container
    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
      width: 100%;
      max-width: 400px;
      height: 4px;
      background: #3f3f46;
      border-radius: 2px;
      overflow: hidden;
    `;
    
    this.progressBar = document.createElement('div');
    this.progressBar.style.cssText = `
      height: 100%;
      background: #3b82f6;
      width: 0%;
      transition: width 0.1s linear;
    `;
    progressContainer.appendChild(this.progressBar);
    
    // Controls container
    this.controlsContainer = document.createElement('div');
    this.controlsContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 20px;
    `;
    
    // Speed down button
    const speedDownBtn = this.createButton('◀ Slower', () => this.adjustSpeed(-50));
    
    // Play/Pause button
    this.playPauseBtn = this.createButton('⏸ Pause', () => this.togglePlay());
    this.playPauseBtn.style.minWidth = '100px';
    
    // Speed up button
    const speedUpBtn = this.createButton('Faster ▶', () => this.adjustSpeed(50));
    
    this.controlsContainer.appendChild(speedDownBtn);
    this.controlsContainer.appendChild(this.playPauseBtn);
    this.controlsContainer.appendChild(speedUpBtn);
    
    // Speed display
    this.speedDisplay = document.createElement('div');
    this.speedDisplay.style.cssText = `
      color: #71717a;
      font-size: 14px;
      margin-top: 10px;
    `;
    this.updateSpeedDisplay();
    
    // Exit hint
    const exitHint = document.createElement('div');
    exitHint.style.cssText = `
      color: #52525b;
      font-size: 12px;
      margin-top: 20px;
    `;
    exitHint.textContent = 'Press Escape to exit';
    
    // Assemble
    content.appendChild(this.wordDisplay);
    content.appendChild(progressContainer);
    content.appendChild(this.controlsContainer);
    content.appendChild(this.speedDisplay);
    content.appendChild(exitHint);
    this.overlay.appendChild(content);
    
    document.body.appendChild(this.overlay);
  }

  /**
   * Create a styled button
   */
  createButton(text, onClick) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      background: #27272a;
      color: #e4e4e7;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#3f3f46';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#27272a';
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  /**
   * Update settings
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    
    if (this.wordDisplay) {
      this.wordDisplay.style.fontSize = `${this.settings.fontSize}px`;
      this.wordDisplay.style.color = this.settings.textColor;
    }
    
    this.updateSpeedDisplay();
  }

  /**
   * Update speed display
   */
  updateSpeedDisplay() {
    if (this.speedDisplay) {
      this.speedDisplay.textContent = `${this.settings.wpm} WPM`;
    }
  }

  /**
   * Start RSVP with given text
   */
  start(text) {
    if (!text || text.trim().length === 0) {
      toast.show('Please select some text first', '⚠', 2000);
      return;
    }
    
    this.init();
    
    // Tokenize text into words
    this.words = this.tokenize(text);
    this.currentIndex = 0;
    
    if (this.words.length === 0) {
      toast.show('No readable text found', '⚠', 2000);
      return;
    }
    
    // Show overlay
    this.overlay.style.display = 'flex';
    
    // Show first word
    this.showCurrentWord();
    
    // Start playback
    this.play();
    
    // Set RSVP context for keybindings
    if (typeof keybindingManager !== 'undefined') {
      keybindingManager.setContext('rsvp');
    }
  }

  /**
   * Tokenize text into words/chunks
   */
  tokenize(text) {
    // Clean up the text
    const cleaned = text
      .replace(/\s+/g, ' ')
      .trim();
    
    // Split into words
    const words = cleaned.split(' ').filter(w => w.length > 0);
    
    // Group into chunks if needed
    if (this.settings.chunkSize > 1) {
      const chunks = [];
      for (let i = 0; i < words.length; i += this.settings.chunkSize) {
        chunks.push(words.slice(i, i + this.settings.chunkSize).join(' '));
      }
      return chunks;
    }
    
    return words;
  }

  /**
   * Show the current word
   */
  showCurrentWord() {
    if (this.currentIndex >= this.words.length) {
      this.complete();
      return;
    }
    
    const word = this.words[this.currentIndex];
    this.wordDisplay.textContent = word;
    
    // Update progress
    const progress = ((this.currentIndex + 1) / this.words.length) * 100;
    this.progressBar.style.width = `${progress}%`;
  }

  /**
   * Calculate delay for current word
   */
  getDelay() {
    const baseDelay = (60 / this.settings.wpm) * 1000;
    
    if (this.settings.pauseOnPunctuation && this.currentIndex < this.words.length) {
      const word = this.words[this.currentIndex];
      // Pause longer on sentence-ending punctuation
      if (/[.!?]$/.test(word)) {
        return baseDelay * 2;
      }
      // Slight pause on commas, semicolons
      if (/[,;:]$/.test(word)) {
        return baseDelay * 1.5;
      }
    }
    
    return baseDelay;
  }

  /**
   * Play the RSVP
   */
  play() {
    if (this.isPlaying) return;
    
    this.isPlaying = true;
    this.updatePlayPauseButton();
    this.scheduleNextWord();
  }

  /**
   * Schedule the next word
   */
  scheduleNextWord() {
    if (!this.isPlaying) return;
    
    const delay = this.getDelay();
    
    this.intervalId = setTimeout(() => {
      this.currentIndex++;
      this.showCurrentWord();
      
      if (this.currentIndex < this.words.length) {
        this.scheduleNextWord();
      }
    }, delay);
  }

  /**
   * Pause the RSVP
   */
  pause() {
    if (!this.isPlaying) return;
    
    this.isPlaying = false;
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    this.updatePlayPauseButton();
  }

  /**
   * Toggle play/pause
   */
  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Update play/pause button text
   */
  updatePlayPauseButton() {
    if (this.playPauseBtn) {
      this.playPauseBtn.textContent = this.isPlaying ? '⏸ Pause' : '▶ Play';
    }
  }

  /**
   * Adjust speed
   */
  adjustSpeed(delta) {
    this.settings.wpm = Math.max(50, Math.min(1000, this.settings.wpm + delta));
    this.updateSpeedDisplay();
    
    // If playing, restart with new speed
    if (this.isPlaying) {
      this.pause();
      this.play();
    }
  }

  /**
   * Complete the RSVP session
   */
  complete() {
    this.pause();
    this.wordDisplay.textContent = '✓ Complete!';
    
    // Update stats
    if (typeof storage !== 'undefined') {
      this.updateStats();
    }
    
    if (this.onComplete) {
      this.onComplete(this.words.length);
    }
    
    // Auto close after delay
    setTimeout(() => {
      this.exit();
    }, 1500);
  }

  /**
   * Update reading stats
   */
  async updateStats() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      const settings = result.settings || {};
      
      if (!settings.stats) {
        settings.stats = {
          totalWordsRead: 0,
          sessionsCompleted: 0,
          averageWpm: 0
        };
      }
      
      settings.stats.totalWordsRead += this.words.length;
      settings.stats.sessionsCompleted += 1;
      settings.stats.lastSessionDate = new Date().toISOString();
      
      await chrome.storage.local.set({ settings });
    } catch (e) {
      console.error('Failed to update stats:', e);
    }
  }

  /**
   * Exit RSVP mode
   */
  exit() {
    this.pause();
    
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
    
    // Reset context
    if (typeof keybindingManager !== 'undefined') {
      keybindingManager.setContext('default');
    }
    
    if (this.onExit) {
      this.onExit();
    }
  }

  /**
   * Check if RSVP is active
   */
  isActive() {
    return this.overlay && this.overlay.style.display === 'flex';
  }

  /**
   * Destroy the RSVP player
   */
  destroy() {
    this.pause();
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}

// Create global instance
const rsvpPlayer = new RSVPPlayer();
