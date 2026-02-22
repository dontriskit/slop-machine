/**
 * SolanaWalletProviders — Wraps children with all required Solana wallet context.
 *
 * Uses devnet. Provides:
 * - ConnectionProvider (RPC endpoint)
 * - WalletProvider (adapters: Phantom)
 *
 * The @solana/wallet-adapter-react-ui stylesheet is imported here so HUD
 * styling is not polluted by wallet modal CSS.
 */
import { useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'

// The wallet-adapter-react-ui modal CSS (connect dialog)
import '@solana/wallet-adapter-react-ui/styles.css'

interface Props {
  children: React.ReactNode
}

export default function SolanaWalletProviders({ children }: Props) {
  // devnet RPC endpoint
  const endpoint = useMemo(() => clusterApiUrl('devnet'), [])

  // Only Phantom for now; add more adapters here as needed
  const wallets = useMemo(() => [new PhantomWalletAdapter()], [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  )
}
