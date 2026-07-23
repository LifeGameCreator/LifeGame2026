/*
 LifeBuilder WebRTC-Konfiguration

 Firebase/Firestore übernimmt bereits das Signaling.
 Öffentliche STUN-Server reichen oft, aber nicht in allen Mobilfunknetzen,
 Firmen-WLANs oder strengen Routern. Für zuverlässige Gespräche wird ein
 TURN-Anbieter benötigt.

 Permanente TURN-Zugangsdaten niemals öffentlich in GitHub veröffentlichen.
 Idealerweise kurzlebige Zugangsdaten des TURN-Anbieters verwenden.
*/
window.LifeBuilderRtcConfig = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302"
      ]
    }

    /*
    Sobald ein TURN-Anbieter vorhanden ist, dieses Beispiel ergänzen:

    ,{
      urls: [
        "turn:DEIN-TURN-SERVER:3478?transport=udp",
        "turns:DEIN-TURN-SERVER:5349?transport=tcp"
      ],
      username: "KURZLEBIGER_BENUTZERNAME",
      credential: "KURZLEBIGES_PASSWORT"
    }
    */
  ]
};
