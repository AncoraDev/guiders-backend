// PM2 para el VPS de 1 vCPU / 4 GB. Copia a /var/www/guiders-backend/
// y arranca: pm2 start ecosystem.small.config.js
// El ecosystem.config.js del repo usa 2 instancias y max 2G (demasiado aquí).

module.exports = {
  apps: [
    {
      name: 'guiders-backend',
      script: 'dist/src/main.js',
      env: {
        NODE_ENV: 'production',
      },
      env_file: '.env.production',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
      error_file: '/var/log/pm2/guiders-backend-error.log',
      out_file: '/var/log/pm2/guiders-backend-out.log',
      log_file: '/var/log/pm2/guiders-backend-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
