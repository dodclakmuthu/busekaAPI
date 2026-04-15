### systemd service location
sudo nano /etc/systemd/system/busapp-api.service

### optional startup wrapper
sudo nano /var/www/dev-busapp-api/start.sh

### make startup wrapper executable
sudo chmod +x /var/www/dev-busapp-api/start.sh

### restart deployment service
sudo systemctl daemon-reload
sudo systemctl start busapp-api
sudo systemctl status busapp-api