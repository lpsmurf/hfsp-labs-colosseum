# Design System Specification: The Autonomous Infrastructure

## 1. Overview & Creative North Star
### Creative North Star: "The Sentinel Archive"
This design system moves away from the "toy-like" aesthetics of retail crypto and towards the sophisticated, high-stakes world of autonomous infrastructure. We view the UI as a **Sentinel Archive**: a high-fidelity command center that feels both heavy with technical authority and light with ethereal, digital intelligence. 

The system breaks the "template" look through **intentional asymmetry**, where large-scale headlines are offset against technical monospaced metadata. We avoid standard grids in favor of **Tonal Layering**, creating a sense of deep space and architectural permanence. This is not just an interface; it is the visual manifestation of an autonomous operating system.

---

## 2. Colors & Surface Logic
The palette is rooted in deep obsidian tones, punctuated by high-energy "Gas" colors that represent action and intelligence.

### The "No-Line" Rule
**Strict Mandate:** Designers are prohibited from using 1px solid borders for sectioning. Structural boundaries must be defined solely through background color shifts or tonal transitions. To separate a sidebar from a main feed, use `surface-container-low` against a `surface` background.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Each "inner" container should move up or down the tier list to define importance:
- **Base Layer:** `surface` (#131313) or `surface-container-lowest` (#0e0e0e) for the core canvas.
- **Mid Layer:** `surface-container` (#201f1f) for primary content areas.
- **Top Layer:** `surface-container-high` (#2a2a2a) for interactive cards.
- **Floating Layer:** `surface-container-highest` (#353534) for modals and menus.

### The "Glass & Gradient" Rule
Floating elements (Modals, Hover Cards) must utilize **Glassmorphism**. 
- **Backdrop Blur:** 20px - 40px.
- **Fill:** `surface-variant` at 40-60% opacity.
- **Glows:** Use `tertiary_container` (#e5d8ff) with a soft 15% opacity radial gradient to highlight "Premium" or "$HERD" related data points.

---

## 3. Typography: Editorial Authority
We contrast the human-centric **Manrope** with the technical, geometric precision of **Space Grotesk**.

| Level | Token | Font | Size | Weight | Character |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-lg` | Space Grotesk | 3.5rem | 700 | Brutalist, high-impact. |
| **Headline** | `headline-md` | Space Grotesk | 1.75rem | 600 | Command-level clarity. |
| **Title** | `title-lg` | Manrope | 1.375rem | 500 | Sophisticated transition. |
| **Body** | `body-lg` | Manrope | 1.0rem | 400 | Maximum readability (16px). |
| **Label** | `label-md` | Space Grotesk | 0.75rem | 500 | Technical metadata/caps. |

**Monospace Fallback:** For all agent logs, terminal outputs, and wallet addresses, use **JetBrains Mono**. This reinforces the "Infrastructure" personality.

---

## 4. Elevation & Depth
Depth is a functional tool, not a decoration. We achieve hierarchy through **Tonal Layering** rather than structural lines.

- **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` section. The "recessed" look creates focus without visual noise.
- **Ambient Shadows:** For floating action buttons or menus, use an extra-diffused shadow: `box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);`. The shadow color must be a tinted version of the background to ensure it feels like natural light absorption.
- **The "Ghost Border":** If accessibility requires a stroke (e.g., input focus), use the `outline-variant` (#3b4b3d) at **20% opacity**. Never use 100% opaque borders.
- **Signature Interactive Background:** All main dashboard views should feature a faint, animated 24px grid background using `outline-variant` at 5% opacity.

---

## 5. Components
### Buttons (The Kinetic Drivers)
- **Primary (Telegram/Action):** `primary-container` (#00ff88). Height: 56px. 12px radius. Text: `label-md` (All Caps). 
  - *Hover:* Scale 1.05, increase brightness by 10%.
- **Secondary (Web App):** `secondary-container` (#00d2fd). Same specs as primary.
- **Tertiary (System):** Ghost style. No background, `outline` text. Soft glow on hover.

### Inputs & Terminal Fields
- **Background:** `surface-container-lowest`. 
- **Indicator:** A 2px vertical "Electric Lime" cursor animation to simulate an active OS environment.
- **States:** Error states use `error` (#ffb4ab) but only as a soft glow/text color, never a thick red border.

### Cards & Lists
- **Rule:** **No Dividers.** 
- Separate list items using 8px of vertical whitespace or a 2% shift in surface luminance between odd/even rows.
- **Agent Cards:** Use Glassmorphism with a `tertiary_fixed_dim` (#d0bcff) soft inner glow (top-left) to signify "Autonomous Agent" status.

### Custom Component: The "Pulse Indicator"
For autonomous agents currently running, use a 4px dot of `primary_fixed` (#60ff99) with a 12px outer radial blur that pulses (0.8s ease-in-out).

---

## 6. Do’s and Don’ts

### Do:
- **Embrace Negative Space:** Use aggressive padding (32px+) to let technical data breathe.
- **Layer with Intent:** Ensure every "step up" in surface color represents a "step closer" to the user.
- **Use Micro-interactions:** Buttons should feel "weighted"—subtle scaling and brightness shifts suggest a physical machine responding.

### Don't:
- **Don't use white:** Pure white (#FFFFFF) is forbidden. Use `primary` (#f1ffef) or `on-surface` (#e5e2e1) to maintain the dark-mode premium feel.
- **Don't use 1px borders:** Rely on the tonal shift between `surface-container-low` and `surface-container-high`.
- **Don't use "Cute" Icons:** Use sharp, technical, geometric iconography. Avoid rounded, bubbly icon sets.

---
**Director's Note:** This system is designed to feel like it's running on a high-end server in the year 2030. Keep it dark, keep it sharp, and let the gradients do the heavy lifting.