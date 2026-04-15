### systemd service location
sudo nano /etc/systemd/system/busapp-api.service

### restart deployment service
sudo systemctl daemon-reload
sudo systemctl start busapp-api
sudo systemctl status busapp-api