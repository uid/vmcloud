apt-get install ubuntu-desktop nodejs ffmpeg libavcodec-extra-53 vlc

userdel vmuser
rm -rf /home/vmuser
useradd -m vmuser

rm -rf /var/vmcloud
cp -r . /var/vmcloud
rm /var/vmcloud/init.sh
chown -R vmuser:vmuser /var/vmcloud

/usr/lib/lightdm/lightdm-set-defaults --autologin vmuser
grep session-setup-script /etc/lightdm/lightdm.conf || echo "session-setup-script=sudo -u vmuser sh /var/vmcloud/bootstrap-vm.sh" >> /etc/lightdm/lightdm.conf
sudo -u vmuser gsettings set org.gnome.desktop.screensaver lock-enabled false
sync
