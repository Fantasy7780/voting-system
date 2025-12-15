'use client';

import { Section } from './Section';
import { useVotingCtx } from '../VotingContext';

export function NewRoundSection() {
  const { devMode, isConnected, newRoundText, setNewRoundText, actions, setAddrDirect, setAddrInput } =
    useVotingCtx();

  if (!devMode) return null;

  return (
    <Section title="New Round">
      <span style={{ fontSize: 12, color: '#666' }}>(deploy a new contract)</span>
      <div style={{ marginTop: 6 }}>
        <input
          value={newRoundText}
          onChange={(e) => setNewRoundText(e.target.value)}
          placeholder='CSV: Alice,Bob or JSON: ["Alice","Bob"]'
          style={{ width: '70%' }}
        />
        <button
          onClick={async () => {
            const newAddr = await actions.deployNewRound(newRoundText);
            if (newAddr) {
              setAddrDirect(newAddr);
              setAddrInput(newAddr);
              setNewRoundText('');
            }
          }}
          disabled={!isConnected || actions.isPending || actions.isMining}
          style={{ marginLeft: 8 }}
        >
          Deploy New Round
        </button>
      </div>
    </Section>
  );
}
