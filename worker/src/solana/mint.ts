// ============================================================================
// SOLANA cNFT MINTING — DEVNET ONLY
// ============================================================================
//
// Mints compressed NFTs (cNFTs) via Metaplex Bubblegum on Solana devnet.
// Uses UMI framework for transaction construction and signing.
//
// Architecture:
//   1. Build NFT metadata JSON and upload to R2
//   2. Create UMI context with the mint authority keypair
//   3. Use Bubblegum's mintV1 instruction to mint a cNFT
//   4. Parse the transaction for the leaf asset ID
//
// Prerequisites:
//   - A Merkle tree must already exist on devnet (MERKLE_TREE_ADDRESS env var)
//   - MINT_AUTHORITY_KEY env secret contains the base58-encoded 64-byte keypair
//   - R2 bucket bound as env.R2 for metadata JSON storage

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  publicKey,
  createSignerFromKeypair,
  signerIdentity,
} from '@metaplex-foundation/umi';
import type { Keypair } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi/serializers';
import {
  mintV1,
  mplBubblegum,
  parseLeafFromMintV1Transaction,
  findLeafAssetIdPda,
} from '@metaplex-foundation/mpl-bubblegum';
import type { NFTMetadata, AssetType } from './types';

/**
 * Environment bindings required for the Solana minting flow.
 */
export interface SolanaEnv {
  R2: R2Bucket;
  SOLANA_RPC_URL: string;
  SOLANA_NETWORK: string;
  MINT_AUTHORITY_KEY: string;
  MERKLE_TREE_ADDRESS: string;
}

/**
 * Result of a successful compressed NFT mint.
 */
export interface MintResult {
  signature: string;
  assetId: string;
}

/**
 * Decode a base58-encoded Solana keypair (64 bytes: 32 secret + 32 public)
 * into a UMI Keypair object.
 *
 * The base58 serializer's `serialize` method encodes a base58 string into
 * raw bytes (Uint8Array). A Solana keypair is 64 bytes where the last 32
 * bytes are the public key.
 */
function decodeKeypair(base58Key: string): Keypair {
  const rawBytes = base58.serialize(base58Key);

  if (rawBytes.length !== 64) {
    throw new Error(
      `Invalid keypair: expected 64 bytes, got ${rawBytes.length}`,
    );
  }

  // Last 32 bytes of the 64-byte keypair are the public key
  const pubKeyBytes = rawBytes.slice(32, 64);
  const pk = publicKey(pubKeyBytes);

  return {
    publicKey: pk,
    secretKey: rawBytes,
  };
}

/**
 * Build the off-chain metadata JSON for a Cosmic Protocol NFT.
 */
export function buildMetadata(
  name: string,
  assetType: AssetType,
  imageUrl: string,
): NFTMetadata {
  return {
    name,
    symbol: 'COSMIC',
    description: `Cosmic Protocol ${assetType.replace(/_/g, ' ')} — ${name}`,
    image: imageUrl,
    attributes: [
      { trait_type: 'Asset Type', value: assetType },
      { trait_type: 'Game', value: 'Cosmic Protocol' },
      { trait_type: 'Network', value: 'devnet' },
      { trait_type: 'Minted At', value: Math.floor(Date.now() / 1000) },
    ],
    properties: {
      category: 'image',
      files: imageUrl
        ? [{ uri: imageUrl, type: 'image/png' }]
        : [],
    },
  };
}

/**
 * Upload metadata JSON to R2 and return its public URL.
 *
 * The key is formatted as: `nft-metadata/{assetId}.json`
 * This assumes R2 is configured with a public custom domain or
 * the worker serves R2 content at a known path.
 */
async function uploadMetadataToR2(
  r2: R2Bucket,
  assetId: string,
  metadata: NFTMetadata,
): Promise<string> {
  const key = `nft-metadata/${assetId}.json`;
  const body = JSON.stringify(metadata, null, 2);

  await r2.put(key, body, {
    httpMetadata: {
      contentType: 'application/json',
    },
  });

  // Return the R2 object key. The caller should prepend the public domain.
  // For devnet, the key is stored and the full URL can be resolved via worker.
  return key;
}

/**
 * Mint a compressed NFT (cNFT) on Solana devnet via Bubblegum.
 *
 * Flow:
 *   1. Build NFT metadata and upload JSON to R2
 *   2. Create UMI context with mint authority identity
 *   3. Send mintV1 transaction to the existing Merkle tree
 *   4. Parse the leaf from the transaction to get the asset ID
 *
 * @param metadata       - The NFT metadata (name, image, attributes, etc.)
 * @param ownerPublicKey - Base58 public key of the NFT recipient
 * @param env            - Cloudflare Worker environment bindings
 * @returns              - Transaction signature and compressed asset ID
 */
export async function mintCompressedNFT(
  metadata: NFTMetadata,
  ownerPublicKey: string,
  env: SolanaEnv,
): Promise<MintResult> {
  // --- 1. Validate environment ---
  if (!env.MINT_AUTHORITY_KEY) {
    throw new Error('MINT_AUTHORITY_KEY secret is not configured');
  }
  if (!env.MERKLE_TREE_ADDRESS) {
    throw new Error('MERKLE_TREE_ADDRESS is not configured');
  }
  if (env.SOLANA_NETWORK !== 'devnet') {
    throw new Error('Only devnet minting is supported');
  }

  const rpcUrl = env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  // --- 2. Create UMI context ---
  const umi = createUmi(rpcUrl).use(mplBubblegum());

  // Decode the mint authority keypair from the env secret
  const authorityKeypair = decodeKeypair(env.MINT_AUTHORITY_KEY);
  const authoritySigner = createSignerFromKeypair(umi, authorityKeypair);
  umi.use(signerIdentity(authoritySigner));

  // --- 3. Generate a unique asset ID for R2 storage ---
  const assetIdForStorage = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // --- 4. Upload metadata to R2 ---
  const metadataKey = await uploadMetadataToR2(
    env.R2,
    assetIdForStorage,
    metadata,
  );

  // The metadata URI. In production this would be a public R2 URL.
  // For devnet, we use a placeholder that the frontend can resolve.
  const metadataUri = `https://r2.cosmic-protocol.dev/${metadataKey}`;

  // --- 5. Prepare Bubblegum mintV1 transaction ---
  const merkleTree = publicKey(env.MERKLE_TREE_ADDRESS);
  const leafOwner = publicKey(ownerPublicKey);

  const txBuilder = mintV1(umi, {
    leafOwner,
    merkleTree,
    metadata: {
      name: metadata.name,
      symbol: metadata.symbol || 'COSMIC',
      uri: metadataUri,
      sellerFeeBasisPoints: 500, // 5% royalty
      collection: null,
      creators: [
        {
          address: authoritySigner.publicKey,
          verified: true,
          share: 100,
        },
      ],
    },
  });

  // --- 6. Send and confirm transaction ---
  const result = await txBuilder.sendAndConfirm(umi);

  // Convert signature bytes back to base58 string
  const signature = base58.deserialize(result.signature)[0];

  // --- 7. Parse the leaf to get the asset ID ---
  const leaf = await parseLeafFromMintV1Transaction(umi, result.signature);

  const [assetPda] = findLeafAssetIdPda(umi, {
    merkleTree,
    leafIndex: leaf.nonce,
  });

  return {
    signature,
    assetId: assetPda as string,
  };
}
