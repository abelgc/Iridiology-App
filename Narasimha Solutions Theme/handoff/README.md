# Narasimha Solutions — Handoff Files

## What's in this folder

Drop these files into your Next.js app exactly as structured:

```
handoff/
├── src/
│   ├── app/
│   │   ├── layout.tsx          → replaces src/app/layout.tsx
│   │   ├── globals.css         → replaces src/app/globals.css
│   │   ├── login/
│   │   │   └── page.tsx        → replaces src/app/login/page.tsx
│   │   └── client/
│   │       └── layout.tsx      → replaces src/app/client/layout.tsx
│   └── components/
│       └── layout/
│           ├── sidebar.tsx     → replaces src/components/layout/sidebar.tsx
│           └── header.tsx      → replaces src/components/layout/header.tsx
└── logo-solutions.png          → copy to public/logo-solutions.png
```

## Changes made

1. **Logo** — all files now reference `/logo-solutions.png` (included here)
2. **Name** — "Narasimha Clay" → "Narasimha Solutions" everywhere
3. **Fonts** — Cormorant Garamond (serif headings) + DM Sans (body) added via `next/font/google`
4. **globals.css** — h1–h4 now use `var(--font-serif)` automatically

## Steps

1. Copy `logo-solutions.png` → `your-app/public/logo-solutions.png`
2. Replace the 6 source files above
3. Run `npm install` (no new packages needed — fonts are loaded via next/font)
4. Deploy as normal
