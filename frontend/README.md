# everDrive Frontend

## Tech Stack
- React + TypeScript + Vite
- React Router (page routing)
- TanStack Query (server-state fetching/cache/polling)

## Run
```bash
cd everdrive/frontend
npm install
cp .env.example .env
npm run dev
```

Backend API defaults to `http://127.0.0.1:43107` via Vite proxy (`/api`).

## Mock / Live Switch
- Runtime switch in `Settings` page:
  - `Mock` uses local fixtures
  - `Live API` hits backend `/api/*`
- Default mode can be set by env:
  - `VITE_DEFAULT_API_MODE=mock` or `live`
