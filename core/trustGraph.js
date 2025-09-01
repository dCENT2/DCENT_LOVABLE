// dCent Core – TrustGraph
// Berechnet Proof-of-Trust Scores aus Verträgen

import { listContracts } from "./contractManager.js";

// TrustScore berechnen für alle Peers
export async function calculateTrustScores() {
  const contracts = await listContracts();
  const scores = {};
  const details = {};

  contracts.forEach(contract => {
    const from = contract.from;
    const to = contract.to;

    // Basis-Punkte pro Vertrag
    const basePoints = 10;

    // Bonus für Verträge mit Collateral
    let bonus = 0;
    if (contract.collateral) {
      const fromCollateral = contract.collateral.from || 0;
      const toCollateral = contract.collateral.to || 0;
      const totalCollateral = fromCollateral + toCollateral;
      bonus = Math.min(20, totalCollateral * 2); // z. B. 2 Punkte pro DZP, max 20
    }

    [from, to].forEach(peer => {
      if (!scores[peer]) scores[peer] = 0;
      if (!details[peer]) details[peer] = { base: 0, bonus: 0 };

      scores[peer] += basePoints + bonus;
      details[peer].base += basePoints;
      details[peer].bonus += bonus;
    });
  });

  return { scores, details };
}

// TrustScore für einen Peer abrufen
export async function getTrustScore(peerId) {
  const { scores } = await calculateTrustScores();
  return scores[peerId] || 0;
}
