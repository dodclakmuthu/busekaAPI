module.exports = {
  apps: [
    {
      name: 'devapi-buseka',
      script: 'dist/main.js',
      cwd: '/var/www/devapi-buseka.lk',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    }
  ]
}
