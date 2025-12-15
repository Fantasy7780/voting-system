'use client';

import { Section } from './Section';
import { useVotingCtx } from '../VotingContext';

export function WalletSection() {
  const {
    isConnected,
    address,
    chainId,
    connectors,
    connect,
    disconnect,
    devMode,
    setDevMode,
    snapshot,
    isChair,
  } = useVotingCtx();

  const roleLabel = snapshot.chairperson ? (isChair ? 'Chairperson' : 'Voter') : '-';

  return (
    <Section title="Wallet" topBorder="none">
      {isConnected ? (
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

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 13, color: '#555' }}>
          Role: {roleLabel} | Developer mode: {devMode ? 'ON' : 'OFF'}
        </div>
        <button onClick={() => setDevMode(!devMode)} style={{ marginTop: 6 }}>
          {devMode ? 'Disable Developer Mode' : 'Enable Developer Mode'}
        </button>
      </div>
    </Section>
  );
}
