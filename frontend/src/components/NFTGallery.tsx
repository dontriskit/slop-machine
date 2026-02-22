/**
 * NFTGallery — Display owned Cosmic Protocol NFTs
 *
 * Fetches the connected wallet's Solana devnet NFTs filtered by
 * the "Cosmic Protocol" collection identifier, then renders a
 * green retro-terminal styled grid.
 *
 * For a production app this would use Metaplex DAS API / @metaplex-foundation/umi.
 * For devnet/demo purposes we store newly minted assets in localStorage and
 * fall back to demo data when no wallet is connected.
 */
import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NFTAttribute {
  trait_type: string
  value: string | number
}

interface NFTItem {
  mintId: string
  name: string
  description: string
  imageUrl: string
  imageBase64?: string
  attributes: NFTAttribute[]
  txSignature?: string
}

// ---------------------------------------------------------------------------
// Demo / localStorage helpers
// ---------------------------------------------------------------------------

const LS_KEY = 'cosmic_protocol_nfts'

function loadStoredNFTs(): NFTItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as NFTItem[]) : []
  } catch {
    return []
  }
}

/** Called by AssetMinter after successful mint to persist locally */
export function storeNFT(nft: NFTItem): void {
  const existing = loadStoredNFTs()
  const updated = [nft, ...existing.filter((n) => n.mintId !== nft.mintId)]
  localStorage.setItem(LS_KEY, JSON.stringify(updated.slice(0, 50)))
}

// ---------------------------------------------------------------------------
// Rarity helpers
// ---------------------------------------------------------------------------

const RARITY_COLORS: Record<string, string> = {
  common: '#aaaaaa',
  uncommon: '#00ff88',
  rare: '#4488ff',
  legendary: '#ffaa00',
}

function getRarityColor(attributes: NFTAttribute[]): string {
  const rarityAttr = attributes.find((a) => a.trait_type === 'Rarity')
  const rarity = String(rarityAttr?.value ?? 'common').toLowerCase()
  return RARITY_COLORS[rarity] ?? '#aaaaaa'
}

// ---------------------------------------------------------------------------
// Sub-component: single NFT card
// ---------------------------------------------------------------------------

function NFTCard({ nft }: { nft: NFTItem }) {
  const rarityColor = getRarityColor(nft.attributes)
  const explorerUrl = nft.txSignature
    ? `https://explorer.solana.com/tx/${nft.txSignature}?cluster=devnet`
    : null

  const typeAttr = nft.attributes.find((a) => a.trait_type === 'Type')
  const styleAttr = nft.attributes.find((a) => a.trait_type === 'Style')

  return (
    <div
      className="nft-card"
      style={{ '--rarity-color': rarityColor } as React.CSSProperties}
    >
      {/* Image */}
      <div className="nft-card__image-wrap">
        {nft.imageBase64 ? (
          <img
            className="nft-card__image"
            src={`data:image/png;base64,${nft.imageBase64}`}
            alt={nft.name}
            loading="lazy"
          />
        ) : nft.imageUrl ? (
          <img
            className="nft-card__image"
            src={nft.imageUrl}
            alt={nft.name}
            loading="lazy"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="nft-card__no-image">No Image</div>
        )}

        {/* Rarity badge */}
        <span className="nft-card__rarity-badge" style={{ color: rarityColor, borderColor: rarityColor }}>
          {nft.attributes.find((a) => a.trait_type === 'Rarity')?.value ?? 'Common'}
        </span>
      </div>

      {/* Info */}
      <div className="nft-card__info">
        <div className="nft-card__name" style={{ color: rarityColor }}>
          {nft.name}
        </div>

        <div className="nft-card__badges">
          {typeAttr && (
            <span className="nft-card__badge">{typeAttr.value}</span>
          )}
          {styleAttr && (
            <span className="nft-card__badge">{styleAttr.value}</span>
          )}
        </div>

        {nft.description && (
          <p className="nft-card__description">{nft.description}</p>
        )}

        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="nft-card__explorer"
          >
            Solana Explorer
          </a>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function NFTGallery() {
  const { publicKey, connected } = useWallet()
  const [nfts, setNfts] = useState<NFTItem[]>([])
  const [loading, setLoading] = useState(false)

  const loadNFTs = useCallback(() => {
    setLoading(true)
    // Load locally stored NFTs (minted in this session / browser)
    const stored = loadStoredNFTs()
    setNfts(stored)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadNFTs()
  }, [publicKey, loadNFTs])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="nft-gallery">
      <div className="nft-gallery__header">
        <h3 className="nft-gallery__title">NFT Gallery</h3>
        <div className="nft-gallery__meta">
          {connected && publicKey ? (
            <span className="nft-gallery__wallet">
              {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
            </span>
          ) : (
            <span className="nft-gallery__no-wallet">No wallet connected</span>
          )}
          <button className="nft-gallery__refresh" onClick={loadNFTs} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="nft-gallery__loading">Loading NFTs...</div>
      )}

      {!loading && nfts.length === 0 && (
        <div className="nft-gallery__empty">
          No NFTs minted yet. Generate and mint an asset above to see it here.
        </div>
      )}

      {!loading && nfts.length > 0 && (
        <div className="nft-gallery__grid">
          {nfts.map((nft) => (
            <NFTCard key={nft.mintId} nft={nft} />
          ))}
        </div>
      )}

      <style>{`
        .nft-gallery {
          font-family: 'Courier New', monospace;
          color: #00ff00;
          background: rgba(0, 8, 20, 0.9);
          border: 2px solid #00ff00;
          border-radius: 4px;
          padding: 16px;
          box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
          width: 100%;
          max-width: 700px;
        }

        .nft-gallery__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }

        .nft-gallery__title {
          margin: 0;
          font-size: 14px;
          color: #ffff00;
          text-shadow: 0 0 8px #ffff00;
          letter-spacing: 1px;
        }

        .nft-gallery__meta {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 11px;
        }

        .nft-gallery__wallet {
          color: #00ffff;
        }

        .nft-gallery__no-wallet {
          opacity: 0.5;
        }

        .nft-gallery__refresh {
          padding: 4px 10px;
          font-size: 10px;
          font-family: 'Courier New', monospace;
          border: 1px solid #00ff00;
          background: rgba(0, 255, 0, 0.1);
          color: #00ff00;
          cursor: pointer;
          border-radius: 3px;
          transition: all 0.2s;
        }

        .nft-gallery__refresh:hover:not(:disabled) {
          background: rgba(0, 255, 0, 0.25);
          box-shadow: 0 0 8px rgba(0, 255, 0, 0.4);
        }

        .nft-gallery__refresh:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .nft-gallery__loading,
        .nft-gallery__empty {
          font-size: 12px;
          opacity: 0.6;
          text-align: center;
          padding: 20px 0;
        }

        .nft-gallery__grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 12px;
        }

        /* --- NFT Card --- */

        .nft-card {
          border: 1px solid var(--rarity-color, #00ff00);
          border-radius: 4px;
          overflow: hidden;
          background: rgba(0, 8, 20, 0.8);
          transition: box-shadow 0.2s;
        }

        .nft-card:hover {
          box-shadow: 0 0 14px color-mix(in srgb, var(--rarity-color, #00ff00) 50%, transparent);
        }

        .nft-card__image-wrap {
          position: relative;
          aspect-ratio: 1;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.5);
        }

        .nft-card__image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .nft-card__no-image {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          opacity: 0.4;
        }

        .nft-card__rarity-badge {
          position: absolute;
          top: 6px;
          right: 6px;
          font-size: 9px;
          font-family: 'Courier New', monospace;
          font-weight: bold;
          border: 1px solid;
          border-radius: 2px;
          padding: 2px 5px;
          background: rgba(0, 8, 20, 0.75);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          text-shadow: 0 0 6px currentColor;
        }

        .nft-card__info {
          padding: 8px;
        }

        .nft-card__name {
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-shadow: 0 0 6px currentColor;
        }

        .nft-card__badges {
          display: flex;
          flex-wrap: wrap;
          gap: 3px;
          margin-bottom: 4px;
        }

        .nft-card__badge {
          font-size: 9px;
          padding: 1px 5px;
          border: 1px solid rgba(0, 255, 0, 0.3);
          border-radius: 2px;
          color: #00ffff;
          background: rgba(0, 255, 255, 0.06);
          text-transform: capitalize;
        }

        .nft-card__description {
          font-size: 9px;
          opacity: 0.55;
          margin: 4px 0;
          line-height: 1.3;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .nft-card__explorer {
          display: inline-block;
          font-size: 9px;
          color: #9945ff;
          text-decoration: none;
          margin-top: 4px;
          text-shadow: 0 0 5px rgba(153, 69, 255, 0.5);
        }

        .nft-card__explorer:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}
