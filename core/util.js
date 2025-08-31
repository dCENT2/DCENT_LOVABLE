// dCent Core – Utility-Funktionen

// Voller SHA-256 Hash aus String
export async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    .replace(/[^a-zA-Z0-9]/g, ""); // Nur sichere Zeichen
}

// Kürzel aus Peer-ID
export function shortId(peerId, length = 10) {
  return peerId.slice(0, length);
}
