// PM2 process definition for the Minigames Hub backend on the minigames host.
// The host gateway routes /api/mg/* to this process (PORT below).
// Usage:
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
        MG_DATA_DIR: "/srv/minigames/data",
        MG_PUBLIC_URL: "https://minigames.xedryk.top",
        MG_SIGNING_SECRET: "replace-me",
        SMTP_HOST: "",
      },
    },
  ],
};