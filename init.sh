apt-get install ubuntu-desktop nodejs ffmpeg libavcodec-extra-53 vlc

useradd -m vmuser

rm -rf /var/vmcloud
cp -r . /var/vmcloud
rm /var/vmcloud/init.sh
chown -R vmuser:vmuser /var/vmcloud

/usr/lib/lightdm/lightdm-set-defaults --auto-login vmuser
echo "session-setup-script=node /var/vmcloud/bootstrap.js" >> /etc/lightdm/lightdm.conf
sync
