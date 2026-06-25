// PM2 process manager config for EC2 production deployment
// Usage: pm2 start ecosystem.config.js
// View logs: pm2 logs csm-control-tower
// Restart: pm2 restart csm-control-tower

module.exports = {
  apps: [{
    name        : 'ke-control-tower',
    script      : 'node_modules/.bin/next',
    args        : 'start -p 3001',
    exec_mode   : 'fork',
    instances   : 1,
    autorestart : true,
    watch       : false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV  : 'production',
      PORT      : 3001,
    },
    // Logs go to ~/.pm2/logs/
    error_file  : 'logs/error.log',
    out_file    : 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
