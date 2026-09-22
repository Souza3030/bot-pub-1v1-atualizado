export type RankName =
  | "Bronze"
  | "Prata"
  | "Ouro"
  | "Platina"
  | "Diamante"
  | "Mestre"
  | "Elite"
  | "Campeao";

export interface RankTier {
  name: RankName;
  displayName: string;
  min: number;
  max: number;
}

export const RANK_TIERS: readonly RankTier[] = [
  { name: "Bronze", displayName: "BRONZE", min: 0, max: 499 },
  { name: "Prata", displayName: "PRATA", min: 500, max: 999 },
  { name: "Ouro", displayName: "OURO", min: 1_000, max: 1_499 },
  { name: "Platina", displayName: "PLATINA", min: 1_500, max: 1_999 },
  { name: "Diamante", displayName: "DIAMANTE", min: 2_000, max: 2_499 },
  { name: "Mestre", displayName: "MESTRE", min: 2_500, max: 2_999 },
  { name: "Elite", displayName: "ELITE", min: 3_000, max: 3_499 },
  { name: "Campeao", displayName: "CAMPEAO", min: 3_500, max: Number.POSITIVE_INFINITY },
] as const;

export function getRankByPoints(points: number): RankTier {
  return RANK_TIERS.find((tier) => points >= tier.min && points <= tier.max) ?? RANK_TIERS[0];
}
