// dCent Core – TrustGraph
// Berechnet Proof-of-Trust Scores aus Verträgen

import { listContracts } from "./contractManager.js";

// TrustScore berechnen für alle Peers
export async function calculateTrustScores() {
  const contracts = await listContracts();
  const scores = {};

  contracts.forEach(contract => {
    const from = contract.from;
    const to = contract.to;

    // Basis-Punkte pro Vertrag
    const basePoints = 10;

    // Bonus für Verträge mit Collateral
    let bonus = 0;
    if (contract.collateral && contract.collateral.status === "locked") {
      const fromCollateral = contract.collateral.from || 0;
      const toCollateral = contract.collateral.to || 0;
      const totalCollateral = fromCollateral + toCollateral;
      bonus = Math.min(20, totalCollateral * 2); // z. B. 2 Punkte pro DZP, max 20
    }

    // Punkte für "from"
    if (!scores[from]) scores[from] = 0;
    scores[from] += basePoints + bonus;

    // Punkte für "to"
    if (!scores[to]) scores[to] = 0;
    scores[to] += basePoints + bonus;
  });

  return scores;
}

// TrustScore für einen Peer abrufen
export async function getTrustScore(peerId) {
  const scores = await calculateTrustScores();
  return scores[peerId] || 0;
}
