module.exports = {
  apps: [
    {
      name: 'buseka-api',
      script: 'dist/main.js',
      cwd: '/var/www/buseka-api',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    }
  ]
}
