gsettings set org.gnome.desktop.screensaver lock-enabled false
cd /var/vmcloud
git fetch --all; git reset --hard origin/master
node /var/vmcloud/bootstrap-vm.js > /var/tmp/vmcloud.out 2> /var/tmp/vmcloud.err &
