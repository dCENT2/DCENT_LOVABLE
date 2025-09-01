// dCent Core – Key Management
// Verwaltung von Identitäten (Keys) mit eindeutiger Peer-ID

import { saveToDB, getFromDB, getAllFromDB } from "./storage.js";
import { sha256 } from "./utils.js";

const STORE_NAME = "keys";

// Neue Identität (KeyPair) erzeugen
export async function createKeyPair(identityName = "default") {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  // Peer-ID = SHA256 vom PublicKey
  const raw = JSON.stringify(publicKeyJwk);
  const peerId = await sha256(raw);

  const keyObject = {
    id: peerId,                   // eindeutige Peer-ID
    shortId: peerId.slice(0, 10), // Kürzel für UI
    name: identityName,           // frei wählbarer Alias
    publicKey: publicKeyJwk,
    privateKey: privateKeyJwk,
    created: new Date().toISOString(),
  };

  await saveToDB(STORE_NAME, keyObject);
  return keyObject;
}

// Alle gespeicherten Keys abrufen
export async function listKeys() {
  return await getAllFromDB(STORE_NAME);
}

// Einzelnen Key abrufen
export async function getKey(peerId) {
  return await getFromDB(STORE_NAME, peerId);
}

// Hilfsfunktion: Peer-Label für UI (Name + Short-ID)
export function formatPeerLabel(peer) {
  return `${peer.name} [${peer.shortId}]`;
}
