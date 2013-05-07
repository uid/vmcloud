rm chrome/cbevent.jar
rm cbevent@uid.csail.mit.edu.xpi
cd chrome
zip -r cbevent.jar content/*
cd ..
zip cbevent@uid.csail.mit.edu.xpi install.rdf chrome.manifest chrome/cbevent.jar
