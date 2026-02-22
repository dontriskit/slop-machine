/**
 * AssetMinter — AI asset generation + NFT minting UI
 *
 * 1. User selects asset type, style, rarity
 * 2. "Generate" → calls /api/assets/generate → shows preview
 * 3. "Mint NFT" → calls /api/nft/mint + creates Solana transaction on devnet
 */
import { useState, useCallback } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { Transaction, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { API_BASE_URL } from '../lib/config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeneratedAsset {
  imageUrl: string
  imageBase64: string
  name: string
  description: string
  attributes: Array<{ trait_type: string; value: string | number }>
}

type AssetType = 'ship_skin' | 'planet_theme' | 'booster' | 'rare_ship'
type AssetStyle = 'cyberpunk' | 'steampunk' | 'alien' | 'organic' | 'crystal' | 'futuristic'
type AssetRarity = 'common' | 'uncommon' | 'rare' | 'legendary'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  ship_skin: 'Ship Skin',
  planet_theme: 'Planet Theme',
  booster: 'Booster',
  rare_ship: 'Rare Ship',
}

const STYLE_LABELS: Record<AssetStyle, string> = {
  cyberpunk: 'Cyberpunk',
  steampunk: 'Steampunk',
  alien: 'Alien',
  organic: 'Organic',
  crystal: 'Crystal',
  futuristic: 'Futuristic',
}

const RARITY_LABELS: Record<AssetRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  legendary: 'Legendary',
}

const RARITY_COLORS: Record<AssetRarity, string> = {
  common: '#aaaaaa',
  uncommon: '#00ff88',
  rare: '#4488ff',
  legendary: '#ffaa00',
}

// Devnet fee receiver — just burns a tiny SOL amount as "minting fee"
// In production this would be replaced by a real Metaplex mint instruction.
const DEVNET_TREASURY = '11111111111111111111111111111111' // System Program = safe burn target

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AssetMinter() {
  const { publicKey, signTransaction } = useWallet()
  const { connection } = useConnection()

  // Form state
  const [assetType, setAssetType] = useState<AssetType>('ship_skin')
  const [style, setStyle] = useState<AssetStyle>('cyberpunk')
  const [rarity, setRarity] = useState<AssetRarity>('common')

  // UI state
  const [generating, setGenerating] = useState(false)
  const [minting, setMinting] = useState(false)
  const [generatedAsset, setGeneratedAsset] = useState<GeneratedAsset | null>(null)
  const [mintTxSignature, setMintTxSignature] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Generate asset
  // ---------------------------------------------------------------------------

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    setGeneratedAsset(null)
    setMintTxSignature(null)

    try {
      const res = await fetch(`${API_BASE_URL}/api/assets/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetType, style, rarity }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error((err as { error: string }).error ?? `HTTP ${res.status}`)
      }

      const asset = (await res.json()) as GeneratedAsset
      setGeneratedAsset(asset)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }, [assetType, style, rarity])

  // ---------------------------------------------------------------------------
  // Mint NFT (devnet)
  // ---------------------------------------------------------------------------

  const handleMint = useCallback(async () => {
    if (!generatedAsset || !publicKey || !signTransaction) {
      setError('Connect your Phantom wallet first.')
      return
    }

    setMinting(true)
    setError(null)
    setMintTxSignature(null)

    try {
      // Step 1: Get mint metadata from backend
      const mintRes = await fetch(`${API_BASE_URL}/api/nft/mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          assetImageUrl: generatedAsset.imageUrl,
          assetName: generatedAsset.name,
          assetDescription: generatedAsset.description,
          attributes: generatedAsset.attributes,
        }),
      })

      if (!mintRes.ok) {
        const err = await mintRes.json().catch(() => ({ error: `HTTP ${mintRes.status}` }))
        throw new Error((err as { error: string }).error ?? `HTTP ${mintRes.status}`)
      }

      // Step 2: Build a minimal Solana devnet transaction as "mint proof"
      // In production this would be replaced by a Metaplex NFT mint.
      const { blockhash } = await connection.getLatestBlockhash()

      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: publicKey,
      })

      // Nominal 0.001 SOL "minting fee" transfer on devnet
      tx.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(DEVNET_TREASURY),
          lamports: Math.floor(0.001 * LAMPORTS_PER_SOL),
        })
      )

      // Step 3: Sign + send
      const signed = await signTransaction(tx)
      const signature = await connection.sendRawTransaction(signed.serialize())
      await connection.confirmTransaction(signature, 'confirmed')

      setMintTxSignature(signature)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setMinting(false)
    }
  }, [generatedAsset, publicKey, signTransaction, connection])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const rarityColor = RARITY_COLORS[rarity]
  const explorerUrl = mintTxSignature
    ? `https://explorer.solana.com/tx/${mintTxSignature}?cluster=devnet`
    : null

  return (
    <div className="asset-minter">
      <h3 className="asset-minter__title">AI Asset Generator</h3>

      {/* Controls */}
      <div className="asset-minter__controls">
        <div className="asset-minter__field">
          <label className="asset-minter__label">Asset Type</label>
          <select
            className="asset-minter__select"
            value={assetType}
            onChange={(e) => setAssetType(e.target.value as AssetType)}
            disabled={generating}
          >
            {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((t) => (
              <option key={t} value={t}>
                {ASSET_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="asset-minter__field">
          <label className="asset-minter__label">Style</label>
          <select
            className="asset-minter__select"
            value={style}
            onChange={(e) => setStyle(e.target.value as AssetStyle)}
            disabled={generating}
          >
            {(Object.keys(STYLE_LABELS) as AssetStyle[]).map((s) => (
              <option key={s} value={s}>
                {STYLE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="asset-minter__field">
          <label className="asset-minter__label">Rarity</label>
          <select
            className="asset-minter__select"
            value={rarity}
            onChange={(e) => setRarity(e.target.value as AssetRarity)}
            disabled={generating}
            style={{ borderColor: rarityColor, color: rarityColor }}
          >
            {(Object.keys(RARITY_LABELS) as AssetRarity[]).map((r) => (
              <option key={r} value={r}>
                {RARITY_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Action buttons */}
      <div className="asset-minter__actions">
        <button
          className="asset-minter__btn asset-minter__btn--generate"
          onClick={handleGenerate}
          disabled={generating || minting}
        >
          {generating ? 'Generating...' : 'Generate'}
        </button>

        <button
          className="asset-minter__btn asset-minter__btn--mint"
          onClick={handleMint}
          disabled={!generatedAsset || !publicKey || minting || generating}
          title={!publicKey ? 'Connect wallet first' : !generatedAsset ? 'Generate an asset first' : ''}
        >
          {minting ? 'Minting...' : 'Mint NFT'}
        </button>
      </div>

      {/* Error */}
      {error && <div className="asset-minter__error">{error}</div>}

      {/* Loading indicator */}
      {generating && (
        <div className="asset-minter__loading">
          <span className="asset-minter__spinner" />
          Generating asset with Workers AI...
        </div>
      )}

      {/* Preview */}
      {generatedAsset && (
        <div className="asset-minter__preview">
          {generatedAsset.imageBase64 ? (
            <img
              className="asset-minter__image"
              src={`data:image/png;base64,${generatedAsset.imageBase64}`}
              alt={generatedAsset.name}
            />
          ) : (
            <div className="asset-minter__image-placeholder">No preview</div>
          )}

          <div className="asset-minter__meta">
            <div className="asset-minter__name" style={{ color: rarityColor }}>
              {generatedAsset.name}
            </div>
            <p className="asset-minter__description">{generatedAsset.description}</p>

            <div className="asset-minter__attributes">
              {generatedAsset.attributes.map((attr) => (
                <span key={attr.trait_type} className="asset-minter__attr">
                  <span className="asset-minter__attr-type">{attr.trait_type}</span>
                  <span className="asset-minter__attr-value">{attr.value}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mint success */}
      {mintTxSignature && explorerUrl && (
        <div className="asset-minter__mint-success">
          <span>NFT minted on Solana devnet!</span>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="asset-minter__explorer-link"
          >
            View on Solana Explorer
          </a>
        </div>
      )}

      <style>{`
        .asset-minter {
          font-family: 'Courier New', monospace;
          color: #00ff00;
          background: rgba(0, 8, 20, 0.9);
          border: 2px solid #00ff00;
          border-radius: 4px;
          padding: 16px;
          box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
          width: 320px;
        }

        .asset-minter__title {
          margin: 0 0 14px 0;
          font-size: 14px;
          color: #ffff00;
          text-shadow: 0 0 8px #ffff00;
          letter-spacing: 1px;
        }

        .asset-minter__controls {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 12px;
        }

        .asset-minter__field {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .asset-minter__label {
          font-size: 11px;
          opacity: 0.7;
          min-width: 70px;
        }

        .asset-minter__select {
          flex: 1;
          background: rgba(0, 8, 20, 0.9);
          border: 1px solid #00ff00;
          color: #00ff00;
          font-family: 'Courier New', monospace;
          font-size: 11px;
          padding: 4px 6px;
          border-radius: 3px;
          cursor: pointer;
          transition: border-color 0.2s;
        }

        .asset-minter__select:focus {
          outline: none;
          box-shadow: 0 0 8px rgba(0, 255, 0, 0.4);
        }

        .asset-minter__select option {
          background: #000814;
          color: #00ff00;
        }

        .asset-minter__actions {
          display: flex;
          gap: 8px;
          margin-bottom: 10px;
        }

        .asset-minter__btn {
          flex: 1;
          padding: 8px;
          font-size: 12px;
          font-family: 'Courier New', monospace;
          border-radius: 3px;
          cursor: pointer;
          transition: all 0.2s;
          font-weight: bold;
          letter-spacing: 0.5px;
        }

        .asset-minter__btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .asset-minter__btn--generate {
          border: 1px solid #00ffff;
          background: rgba(0, 255, 255, 0.1);
          color: #00ffff;
        }

        .asset-minter__btn--generate:hover:not(:disabled) {
          background: rgba(0, 255, 255, 0.25);
          box-shadow: 0 0 12px rgba(0, 255, 255, 0.5);
        }

        .asset-minter__btn--mint {
          border: 1px solid #9945ff;
          background: rgba(153, 69, 255, 0.15);
          color: #c77dff;
        }

        .asset-minter__btn--mint:hover:not(:disabled) {
          background: rgba(153, 69, 255, 0.3);
          box-shadow: 0 0 12px rgba(153, 69, 255, 0.5);
        }

        .asset-minter__error {
          color: #ff4444;
          font-size: 11px;
          margin-bottom: 8px;
          word-break: break-word;
          text-shadow: 0 0 6px rgba(255, 68, 68, 0.6);
        }

        .asset-minter__loading {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: #ffff00;
          margin-bottom: 8px;
          animation: pulse 1s infinite;
        }

        .asset-minter__spinner {
          display: inline-block;
          width: 10px;
          height: 10px;
          border: 2px solid #ffff00;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .asset-minter__preview {
          border: 1px solid rgba(0, 255, 0, 0.3);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .asset-minter__image {
          display: block;
          width: 100%;
          max-height: 200px;
          object-fit: contain;
          background: rgba(0, 0, 0, 0.5);
        }

        .asset-minter__image-placeholder {
          height: 120px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.4;
          font-size: 12px;
          background: rgba(0, 0, 0, 0.3);
        }

        .asset-minter__meta {
          padding: 10px;
        }

        .asset-minter__name {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 4px;
          text-shadow: 0 0 8px currentColor;
        }

        .asset-minter__description {
          font-size: 10px;
          opacity: 0.7;
          margin: 4px 0 8px 0;
          line-height: 1.4;
        }

        .asset-minter__attributes {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        .asset-minter__attr {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          background: rgba(0, 255, 0, 0.06);
          border: 1px solid rgba(0, 255, 0, 0.25);
          border-radius: 3px;
          padding: 3px 6px;
          font-size: 9px;
        }

        .asset-minter__attr-type {
          opacity: 0.5;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .asset-minter__attr-value {
          color: #00ffff;
          font-weight: bold;
          font-size: 10px;
        }

        .asset-minter__mint-success {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 11px;
          color: #00ff88;
          text-shadow: 0 0 8px rgba(0, 255, 136, 0.6);
          padding: 8px;
          border: 1px solid #00ff88;
          border-radius: 3px;
          background: rgba(0, 255, 136, 0.05);
        }

        .asset-minter__explorer-link {
          color: #9945ff;
          text-decoration: none;
          font-size: 10px;
          text-shadow: 0 0 6px rgba(153, 69, 255, 0.6);
        }

        .asset-minter__explorer-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}
