// dCent Core – Contract Management (mit Whitepaper-Collateral-Logik + Status)

import { getKey } from "./keyManager.js";
import { saveToDB, getAllFromDB, getFromDB } from "./storage.js";
import { subtractCollateral, addCollateral } from "./collateralManager.js";

const STORE_NAME = "contracts";

//
// -------- AES Hilfsfunktionen --------
//
async function generateAESKey() {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

async function encryptAES(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: Array.from(iv)
  };
}

async function decryptAES(key, encryptedData, iv) {
  const bytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  const ivArray = new Uint8Array(iv);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivArray }, key, bytes);
  return new TextDecoder().decode(plaintext);
}

//
// -------- AES Key-Sharing --------
//
async function encryptKeyForPeer(aesKey, peerId) {
  const peerKey = await getKey(peerId);
  if (!peerKey) throw new Error(`Kein Key für ${peerId}`);
  const rawKey = await crypto.subtle.exportKey("jwk", aesKey);
  return btoa(JSON.stringify(rawKey));
}

async function decryptKeyForPeer(encryptedKeyB64, peerId) {
  const rawKey = JSON.parse(atob(encryptedKeyB64));
  return await crypto.subtle.importKey("jwk", rawKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

//
// -------- Signatur Hilfsfunktionen --------
//
async function signData(privateKeyJwk, data) {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, encoded);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function verifySignature(publicKeyJwk, data, signatureB64) {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"]
  );
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const sigBytes = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
  return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, sigBytes, encoded);
}

//
// -------- Vertragsfunktionen --------
//
export async function createContract(fromId, toId, content, amount = 0, collateralAmount = 0) {
  const fromKey = await getKey(fromId);
  if (!fromKey) throw new Error(`Kein Key für ${fromId}`);

  const contractId = `ctr_${Date.now()}`;
  const created = new Date().toISOString();

  // Ephemeral AES-Key
  const aesKey = await generateAESKey();
  const encrypted = await encryptAES(aesKey, content);

  // AES-Key für beide Parteien speichern
  const encryptedKeys = {};
  encryptedKeys[fromId] = await encryptKeyForPeer(aesKey, fromId);
  encryptedKeys[toId] = await encryptKeyForPeer(aesKey, toId);

  // Collateral nur vom Sender ("from") abziehen
  let collateral = null;
  if (collateralAmount > 0) {
    try {
      await subtractCollateral(fromId, collateralAmount); // vom Guthaben abziehen
      collateral = {
        from: collateralAmount,
        to: 0,
        status: "locked"
      };
    } catch (err) {
      console.warn("Collateral konnte nicht abgezogen werden:", err);
    }
  }

  // Basisdaten inkl. Status
  const baseData = {
    id: contractId,
    from: fromId,
    to: toId,
    amount,
    created,
    encryptedContent: encrypted.ciphertext,
    iv: encrypted.iv,
    encryptedKeys,
    collateral,
    status: "pending",
    approvals: {}
  };

  // Signatur
  const signature = await signData(fromKey.privateKey, baseData);

  const contract = {
    ...baseData,
    signature,
    signer: fromId
  };

  await saveToDB(STORE_NAME, contract);
  return contract;
}

// Alle Verträge abrufen
export async function listContracts() {
  return await getAllFromDB(STORE_NAME);
}

// Vertrag entschlüsseln
export async function decryptContract(contract, peerId) {
  if (!contract.encryptedKeys[peerId]) {
    throw new Error("Peer ist nicht Teil dieses Vertrags");
  }
  const aesKey = await decryptKeyForPeer(contract.encryptedKeys[peerId], peerId);
  const plaintext = await decryptAES(aesKey, contract.encryptedContent, contract.iv);
  return { ...contract, content: plaintext };
}

// Vertragssignatur prüfen
export async function verifyContractSignature(contract) {
  const { signature, signer, ...baseData } = contract;
  const signerKey = await getKey(signer);
  if (!signerKey) throw new Error(`Kein Key für ${signer}`);
  return await verifySignature(signerKey.publicKey, baseData, signature);
}

// Status setzen (active/broken) mit Whitepaper-Collateral-Logik
export async function setContractStatus(contractId, peerId, status) {
  const contract = await getFromDB(STORE_NAME, contractId);
  if (!contract) throw new Error("Vertrag nicht gefunden");
  if (![contract.from, contract.to].includes(peerId)) {
    throw new Error("Peer gehört nicht zum Vertrag");
  }

  contract.approvals = contract.approvals || {};
  contract.approvals[peerId] = status;

  // Beide Parteien müssen active → Vertrag erfüllt
  if (contract.approvals[contract.from] === "active" &&
      contract.approvals[contract.to] === "active") {
    contract.status = "active";
    if (contract.collateral && contract.collateral.status === "locked") {
      await addCollateral(contract.to, contract.collateral.from); // Empfänger bekommt Collateral
      contract.collateral.status = "released";
      contract.collateral.to = contract.collateral.from;
      contract.collateral.from = 0;
    }
  }
  // Beide Parteien müssen broken → Vertrag gebrochen → Collateral verbrannt
  else if (contract.approvals[contract.from] === "broken" &&
           contract.approvals[contract.to] === "broken") {
    contract.status = "broken";
    if (contract.collateral) {
      contract.collateral.status = "burned";
    }
  }
  else {
    contract.status = "pending"; // solange nur eine Seite entschieden hat
  }

  await saveToDB(STORE_NAME, contract);
  return contract;
}
