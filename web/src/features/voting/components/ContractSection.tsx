'use client';

import { Section } from './Section';
import { useVotingCtx } from '../VotingContext';

export function ContractSection() {
  const { isChair, devMode, addr, addrInput, setAddrInput, setAddrFromInput } = useVotingCtx();

  if (!devMode && !isChair) return null;

  return (
    <Section title="Contract" topBorder="none">
      {devMode && (
      <div style={{ marginTop: 6 }}>
        <input
          value={addrInput}
          onChange={(e) => setAddrInput(e.target.value)}
          placeholder="0x..."
          style={{ width: '70%' }}
        />
        <button onClick={setAddrFromInput} style={{ marginLeft: 8 }}>
          Use address
        </button>
      </div>
      )}
      <div style={{ marginTop: 6, fontSize: 13, color: '#555' }}>Active: {addr || '-'}</div>
    </Section>
  );
}
