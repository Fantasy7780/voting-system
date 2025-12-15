'use client';

import { useEffect, useState } from 'react';
import { Section } from './Section';
import { useVotingCtx } from '../VotingContext';

export function WalletSection() {
  const { isConnected, address, chainId, connectors, connect, disconnect } = useVotingCtx();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Section title="Wallet" topBorder="none">
      {!mounted ? (
        <div style={{ fontSize: 13, color: '#555' }}>Loading wallet…</div>
      ) : isConnected ? (
        <div>
          <div>
            {address} (chain {chainId})
          </div>
          <button onClick={() => disconnect()}>Disconnect</button>
        </div>
      ) : (
        connectors.map((c) => (
          <button key={c.uid} onClick={() => connect({ connector: c })} style={{ marginRight: 8 }}>
            Connect {c.name}
          </button>
        ))
      )}
    </Section>
  );
}
