// dCent Core – TrustGraph
// Berechnet einfache Proof-of-Trust Scores aus Verträgen

import { listContracts } from "./contractManager.js";

// TrustScore berechnen für alle Peers
export async function calculateTrustScores() {
  const contracts = await listContracts();
  const scores = {};

  contracts.forEach(contract => {
    const from = contract.from;
    const to = contract.to;

    // Punkte für "from"
    if (!scores[from]) scores[from] = 0;
    scores[from] += 10;

    // Punkte für "to"
    if (!scores[to]) scores[to] = 0;
    scores[to] += 10;
  });

  return scores;
}

// TrustScore für einen Peer abrufen
export async function getTrustScore(peerId) {
  const scores = await calculateTrustScores();
  return scores[peerId] || 0;
}
