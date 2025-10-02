# Lorg Brand Guide

## Concept
Lorg embraces a 16-bit adventure vibe—lush forest canopies, sun-dappled clearings, and the gentle glow of a top-down SNES overworld. Colors lean toward woodland greens and golden light while UI elements keep the chunky, game-pad feel.

## Core Colors
| Token | Hex | Usage |
| --- | --- | --- |
| `retro-space` | `#173A2B` | Depth background, forest shadow |
| `retro-panel` | `#1E4F39` | Primary panels, cards |
| `retro-panel-alt` | `#296848` | Header, sidebars, overlays |
| `retro-pixel` | `#3FD8A6` | Sprites, CTAs, path highlights |
| `retro-sun` | `#F6DD85` | Borders, progress badges |
| `retro-rose` | `#F9A6C2` | Alerts, blossom accents |
| `retro-ink` | `#F3F2E8` | Text |

These tokens live in `tailwind.config.js` and drive both light and dark treatments.

## Typography
- **Display / Wordmark:** `Press Start 2P` with wide tracking for all-caps beats. Use sparingly (nav, big headings, callouts).
- **Body:** `VT323` for paragraphs and supporting text. Keep copy short; the mono pixel font rewards tight phrasing.

## Iconography
- No standalone logo: the header uses the text wordmark `Lorg` with a drop-shadow.
- The favicon (`public/favicon.svg`) is a pixel “L” tile. Reuse it for social avatars if needed.

## Usage
- Favor flat colors, chunky borders (4–8px), and drop-shadows offset by whole pixels.
- Layer repeating-linear gradients or grid overlays to sell the CRT scanline feel.
- When highlighting novelty, combine `retro-pixel` fills with `retro-sun` borders for maximum arcade punch.

## Tone & Voice
Playful, challenge-oriented, and encouraging. Celebrate exploration (“Unlock fresh tiles”, “Claim new streets”) and avoid grindy or technical language. Keep sentences short and energetic—like snackable quest text.
