// ============================================================================
// SOLANA NFT TYPES
// ============================================================================

/**
 * NFT metadata following the Metaplex Token Metadata Standard.
 * Used for both on-chain metadata URI and off-chain JSON stored in R2.
 */
export interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string; // R2 public URL
  attributes: Array<{ trait_type: string; value: string | number }>;
  properties: {
    category: 'image';
    files: Array<{ uri: string; type: string }>;
  };
}

/**
 * Asset categories for Cosmic Protocol NFTs.
 * - ship_skin: cosmetic ship appearance
 * - planet_theme: planet visual theme
 * - booster: temporary gameplay boost
 * - rare_ship: unique ship variant
 */
export type AssetType = 'ship_skin' | 'planet_theme' | 'booster' | 'rare_ship';

/**
 * An NFT asset record stored in D1, tracking the link between
 * the game entity and its on-chain Solana representation.
 */
export interface NFTAsset {
  id: string;
  playerId: string;
  mintAddress?: string;
  assetType: AssetType;
  name: string;
  imageUrl?: string;
  metadataUri?: string;
  solanaTx?: string;
  network: 'devnet' | 'mainnet-beta';
  createdAt: number;
}

/** Valid asset types for validation */
export const VALID_ASSET_TYPES: AssetType[] = [
  'ship_skin',
  'planet_theme',
  'booster',
  'rare_ship',
];

/**
 * Request payload for the POST /api/nft/mint endpoint.
 */
export interface MintRequest {
  playerId: string;
  assetType: AssetType;
  name: string;
  imageUrl?: string;
  ownerPublicKey: string;
}

/**
 * Response from a successful mint operation.
 */
export interface MintResponse {
  asset: NFTAsset;
  signature: string;
  assetId: string;
}
