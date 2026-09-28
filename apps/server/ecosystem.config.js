/**
 * PM2 Ecosystem Configuration
 * For running SkyRush backend on Oracle Cloud
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 logs
 *   pm2 restart all
 *   pm2 stop all
 */

module.exports = {
  apps: [{
    name: 'skyrush-backend',
    script: './dist/apps/server/src/index.js',
    instances: 1,
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    log_file: './logs/combined.log',
    time: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    listen_timeout: 3000,
    kill_timeout: 5000
  }]
};
