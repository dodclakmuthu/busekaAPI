### pm2 ecosystem file
sudo nano /var/www/buseka-api/ecosystem.config.js

### start or restart with pm2
cd /var/www/buseka-api
pm2 start ecosystem.config.js --only buseka-api --update-env || pm2 restart buseka-api --update-env
pm2 save

### enable pm2 on boot (one time)
pm2 startup systemd -u ubuntu --hp /home/ubuntu
# Run the command printed by pm2 startup, then:
pm2 save

### disable old systemd api service (one time)
sudo systemctl stop buseka-api.service || true
sudo systemctl disable buseka-api.service || true
sudo rm -f /etc/systemd/system/buseka-api.service
sudo systemctl daemon-reload
sudo systemctl reset-failed

### nginx reverse proxy for api
sudo nano /etc/nginx/sites-available/buseka-api

### suggested nginx server block
server {
	listen 80;
	server_name api.buseka.com;

	location / {
		proxy_pass http://127.0.0.1:3001;
		proxy_http_version 1.1;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection 'upgrade';
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_cache_bypass $http_upgrade;
	}
}

### enable nginx site and reload
sudo ln -sf /etc/nginx/sites-available/buseka-api /etc/nginx/sites-enabled/buseka-api
sudo nginx -t
sudo systemctl reload nginx