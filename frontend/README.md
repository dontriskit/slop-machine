# Cosmic Protocol Frontend

3D space game visualization built with React, Three.js, and React Three Fiber.

## Architecture

- **React 19** - UI framework
- **Three.js** - 3D rendering engine
- **React Three Fiber** - React abstraction for Three.js
- **Zustand** - State management
- **Vite** - Build tool and dev server

## Project Structure

```
src/
├── components/
│   ├── Galaxy.tsx       # Main galaxy visualization
│   ├── System.tsx       # Star system with planets
│   ├── Planet.tsx       # Individual planet
│   ├── HUD.tsx          # UI overlay
│   └── HUD.css
├── store/
│   └── gameStore.ts     # Zustand state management
├── lib/
│   └── galaxyGenerator.ts  # Procedural galaxy generation
├── App.tsx
├── main.tsx
└── index.css
```

## Getting Started

```bash
cd frontend
pnpm install
pnpm run dev
```

Open `http://localhost:5173` in your browser.

## Development

- **Hot reload** - Changes auto-refresh
- **TypeScript** - Full type safety
- **Dev proxy** - `/api/*` routes proxy to `http://localhost:8787` (worker)

## Build

```bash
pnpm run build
```

Output goes to `dist/`

## Features

### Galaxy View
- Procedurally generated spiral galaxy layout
- 499 systems per galaxy
- 1-15 planets per system
- Click-to-select systems and planets
- Orbit controls for 3D navigation

### Visual Style
- Dark space background
- Cartoonish planet designs
- Glowing star cores
- Animated orbits
- Green retro-terminal HUD

### Interaction
- Drag to rotate view
- Scroll to zoom
- Click to select systems/planets
- Galaxy switcher (1-9)
- Real-time coordinate info

## API Integration

The frontend communicates with the Cloudflare Workers backend via:
- REST API calls to `/api/*` endpoints
- WebSocket for real-time updates (future)

The dev server proxies `/api/` calls to `http://localhost:8787`.

## Performance Optimization

- Instanced geometry for stars
- LOD (Level of Detail) for distant systems
- Efficient reuse of planet components
- WebGL rendering pipeline

## Future Enhancements

- System zoom view with detailed planet info
- Fleet visualization and movement animations
- Real-time player updates via WebSocket
- Mining/building UI panels
- Space background parallax
