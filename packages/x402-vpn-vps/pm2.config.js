module.exports = {
  apps: [
    {
      name:         "vpn-x402-backend",
      script:       "dist/index.js",
      cwd:          "./backend",
      instances:    1,
      exec_mode:    "fork",
      env: {
        NODE_ENV: "production",
        DEV_MODE: "false",
      },
      error_file:   "/var/log/pm2/vpn-x402-backend-error.log",
      out_file:     "/var/log/pm2/vpn-x402-backend-out.log",
      merge_logs:   true,
      restart_delay: 5000,
      max_restarts:  10,
    },
    {
      name:         "vpn-x402-frontend",
      script:       "node_modules/.bin/next",
      args:         "start",
      cwd:          "./frontend",
      instances:    1,
      exec_mode:    "fork",
      env: {
        NODE_ENV: "production",
        PORT:     "3000",
      },
      error_file:   "/var/log/pm2/vpn-x402-frontend-error.log",
      out_file:     "/var/log/pm2/vpn-x402-frontend-out.log",
      merge_logs:   true,
      restart_delay: 5000,
      max_restarts:  10,
    },
  ],
};
