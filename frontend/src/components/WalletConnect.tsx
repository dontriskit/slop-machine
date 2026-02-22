/**
 * WalletConnect — Phantom Wallet integration component
 *
 * Renders a connect/disconnect button styled to match the
 * green retro-terminal HUD aesthetic.
 *
 * Requires the app to be wrapped in <SolanaWalletProviders> (see main.tsx).
 */
import { useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'

// Truncate a base-58 wallet address for display: "AbCd...XyZw"
function truncateAddress(addr: string, chars = 4): string {
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`
}

interface WalletConnectProps {
  /** Additional CSS class to apply to the outer wrapper */
  className?: string
}

export default function WalletConnect({ className }: WalletConnectProps) {
  const { publicKey, connected, connecting, disconnecting, connect, disconnect, select, wallets } =
    useWallet()

  const handleConnect = useCallback(async () => {
    // Auto-select Phantom if no wallet is selected yet
    if (!wallets.length) return
    const phantom = wallets.find((w) => w.adapter.name === 'Phantom')
    if (phantom) {
      select(phantom.adapter.name)
    } else {
      // Fall back to first available wallet
      select(wallets[0]!.adapter.name)
    }
    try {
      await connect()
    } catch {
      // User rejected or wallet not installed — swallow the error here;
      // wallet-adapter already logs it.
    }
  }, [wallets, select, connect])

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect()
    } catch {
      // ignore
    }
  }, [disconnect])

  return (
    <div className={`wallet-connect${className ? ` ${className}` : ''}`}>
      {connected && publicKey ? (
        <div className="wallet-info">
          <span className="wallet-label">Wallet:</span>
          <span className="wallet-address" title={publicKey.toBase58()}>
            {truncateAddress(publicKey.toBase58())}
          </span>
          <button
            className="wallet-btn wallet-btn--disconnect"
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <button
          className="wallet-btn wallet-btn--connect"
          onClick={handleConnect}
          disabled={connecting}
        >
          {connecting ? 'Connecting...' : 'Connect Phantom'}
        </button>
      )}

      <style>{`
        .wallet-connect {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'Courier New', monospace;
        }

        .wallet-info {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
        }

        .wallet-label {
          opacity: 0.6;
          color: #00ff00;
        }

        .wallet-address {
          color: #00ffff;
          font-weight: bold;
          letter-spacing: 0.5px;
          cursor: default;
        }

        .wallet-btn {
          padding: 6px 12px;
          font-size: 11px;
          font-family: 'Courier New', monospace;
          border-radius: 3px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .wallet-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .wallet-btn--connect {
          border: 1px solid #9945ff;
          background: rgba(153, 69, 255, 0.15);
          color: #c77dff;
          text-shadow: 0 0 8px rgba(153, 69, 255, 0.8);
        }

        .wallet-btn--connect:hover:not(:disabled) {
          background: rgba(153, 69, 255, 0.3);
          box-shadow: 0 0 12px rgba(153, 69, 255, 0.5);
        }

        .wallet-btn--disconnect {
          border: 1px solid #ff4444;
          background: rgba(255, 68, 68, 0.1);
          color: #ff8888;
        }

        .wallet-btn--disconnect:hover:not(:disabled) {
          background: rgba(255, 68, 68, 0.25);
          box-shadow: 0 0 10px rgba(255, 68, 68, 0.5);
        }
      `}</style>
    </div>
  )
}
