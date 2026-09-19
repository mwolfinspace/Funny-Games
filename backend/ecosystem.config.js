// PM2 process definition for the Minigames Hub backend on the minigames host.
// The host gateway routes /api/mg/* to this process (PORT below).
//
// Secrets/env live in backend/.env (auto-loaded by backend/env.js on boot),
// so nothing sensitive is hardcoded here. Bare defaults below only matter if
// ports/paths change.
//
// Usage:
//   cp backend/env.example backend/.env   # then fill in values
//   pm2 start backend/ecosystem.config.js
//   pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: "minigames-hub",
      script: "backend/server.js",
      cwd: __dirname + "/..",
      instances: 1,
      autorestart: true,
      max_memory_restart: "200M",
      env: {
        PORT: "8907",
      },
    },
  ],
};