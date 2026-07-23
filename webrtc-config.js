/*
 LifeBuilder WebRTC-Konfiguration · Telefon-Fix 2026-07-23

 Firebase/Firestore übernimmt das Signaling. STUN reicht für viele direkte
 Verbindungen. Für Gespräche zwischen unterschiedlichen Mobilfunk-, Firmen-
 oder streng gefilterten WLAN-Netzen wird zusätzlich ein TURN-Dienst benötigt.

 turnCredentialsUrl darf eine HTTPS-Adresse sein, die ein ICE-Server-Array
 oder { "iceServers": [...] } zurückgibt. Keine geheimen TURN-Passwörter direkt
 in dieses öffentliche GitHub-Repository eintragen.
*/
window.LifeBuilderRtcConfig = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302"
      ]
    }
  ],

  // Beispiel nach Einrichtung eines TURN-Anbieters:
  // turnCredentialsUrl: "https://DEINE-APP.example/api/turn/credentials"
  turnCredentialsUrl: ""
};
