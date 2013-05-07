sed -i "/^# deb.*multiverse/ s/^# //" /etc/apt/sources.list
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get -y install ubuntu-desktop nodejs ffmpeg libavcodec-extra-53 vlc ubuntu-restricted-extras tightvncserver x11vnc icecast2 darkice

userdel vmuser
rm -rf /home/vmuser
useradd -m vmuser

rm -rf /var/vmcloud
cp -r . /var/vmcloud
rm /var/vmcloud/init.sh
chown -R vmuser:vmuser /var/vmcloud

/usr/lib/lightdm/lightdm-set-defaults --autologin vmuser
grep session-setup-script /etc/lightdm/lightdm.conf || echo "session-setup-script=sudo -u vmuser sh /var/vmcloud/bootstrap-vm.sh" >> /etc/lightdm/lightdm.conf

cp scripts/icecast.xml /etc/icecast2/icecast.xml
cp scripts/icecast2 /etc/default/icecast2

rm -rf /usr/share/mozilla/extensions/{ec8030f7-c20a-464f-9b0e-13a3a9e97384}/cbevent@uid.csail.mit.edu
cp -r firefox-extension /usr/share/mozilla/extensions/{ec8030f7-c20a-464f-9b0e-13a3a9e97384}/cbevent@uid.csail.mit.edu
chmod -R 777 /usr/share/mozilla/extensions/{ec8030f7-c20a-464f-9b0e-13a3a9e97384}/cbevent@uid.csail.mit.edu

sync
