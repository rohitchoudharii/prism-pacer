# Prism Pacer

A Chrome extension to enhance reading focus and speed with visual aids.

## Features

### Visual Pacer

A horizontal line that follows your cursor to guide your reading.

- **Smart Text Detection:** Underlines actual text lines, not full page width
- **Skips Interactive Elements:** Automatically hides over links and buttons
- **Smooth Animation:** Fluid movement with configurable settings

### Page Dimmer

Creates a focused reading window by dimming surrounding content.

- **Banner Mode:** Full-width top/bottom overlays creating a horizontal reading strip
- **Focused Box Mode:** Adaptive spotlight that matches the width of the text block you're reading
- **Scroll Aware:** Hides during scroll, reappears on mouse move

### RSVP Mode

Rapid Serial Visual Presentation for speed reading.

- Displays text word-by-word at configurable speed
- Select any text on a page and activate RSVP to speed read it
- Adjustable words per minute (100-1000 WPM)

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right corner)
4. Click **Load unpacked**
5. Select the `speed-reader` folder

## Keyboard Shortcuts

All shortcuts are customizable via the settings page.

### Mac

| Action | Shortcut |
|--------|----------|
| Toggle Pacer | `Option + Shift + P` |
| Toggle Dimmer | `Option + Shift + D` |
| Toggle Both | `Option + Shift + B` |
| Disable All | `Option + Shift + X` |
| Start RSVP | `Option + Shift + R` |
| Increase Window Height | `Option + Shift + Up` |
| Decrease Window Height | `Option + Shift + Down` |
| Increase Opacity | `Option + Shift + =` |
| Decrease Opacity | `Option + Shift + -` |

### Windows / Linux

| Action | Shortcut |
|--------|----------|
| Toggle Pacer | `Alt + Shift + P` |
| Toggle Dimmer | `Alt + Shift + D` |
| Toggle Both | `Alt + Shift + B` |
| Disable All | `Alt + Shift + X` |
| Start RSVP | `Alt + Shift + R` |
| Increase Window Height | `Alt + Shift + Up` |
| Decrease Window Height | `Alt + Shift + Down` |
| Increase Opacity | `Alt + Shift + =` |
| Decrease Opacity | `Alt + Shift + -` |

### RSVP Mode Controls

| Action | Key |
|--------|-----|
| Pause / Play | `Space` |
| Speed Up (+50 WPM) | `Right Arrow` |
| Speed Down (-50 WPM) | `Left Arrow` |
| Exit | `Escape` |

## Settings

Access settings by right-clicking the extension icon and selecting **Options**.

### Visual Pacer Settings

| Setting | Description |
|---------|-------------|
| Line Height | Thickness of the pacer line (2-20px) |
| Line Color | Color of the pacer line |
| Opacity | Transparency of the pacer line (10-100%) |
| Vertical Offset | Shift line position up or down |
| Smooth Follow | Enable smooth animation when following cursor |
| Smart Text Detection | Underline text lines only instead of full width |
| Fade on Scroll | Smooth fade vs instant hide when scrolling |

### Page Dimmer Settings

| Setting | Description |
|---------|-------------|
| Dimmer Opacity | Darkness of the dimmed areas (30-95%) |
| Dimmer Color | Color of the overlay |
| Reading Window Height | Height of the visible reading area (30-200px) |
| Transition Speed | Animation speed for position changes (0-500ms) |
| Fade on Scroll | Smooth fade vs instant hide when scrolling |
| Focused Box Mode | Use adaptive box instead of full-width banners |

### RSVP Settings

| Setting | Description |
|---------|-------------|
| Words Per Minute | Reading speed (100-1000 WPM) |
| Chunk Size | Number of words shown at once (1-3) |
| Font Size | Size of displayed text (16-64px) |
| Pause on Punctuation | Briefly pause at sentence endings |

## Completed Features

- [x] Visual Pacer with cursor following
- [x] Smart Text Detection (detects full visual lines across inline elements)
- [x] Skip interactive elements (links, buttons)
- [x] Page Dimmer - Banner mode (full-width top/bottom overlays)
- [x] Page Dimmer - Focused Box mode (adaptive spotlight)
- [x] RSVP mode for rapid word-by-word reading
- [x] Configurable keyboard shortcuts
- [x] Settings page with full customization UI
- [x] Scroll handling (hide on scroll, show on mouse move)
- [x] Fade on scroll option (smooth vs instant)
- [x] Cross-platform keyboard support (Mac/Windows/Linux)
- [x] Toast notifications for feature toggles

## Future Scope

- [ ] PDF reading support via custom PDF.js viewer

## Known Limitations

- **PDF Files:** Chrome's built-in PDF viewer uses a native plugin that doesn't expose DOM elements. The extension cannot detect text or overlay elements on PDFs viewed in Chrome's default viewer. PDF support is planned for a future release.
