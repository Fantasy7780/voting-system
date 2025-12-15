'use client';

import { Section } from './Section';
import { useVotingCtx } from '../VotingContext';
import { isBytes32Hex } from '../utils';

export function CommitSection() {
  const { actions, selIndex, salt, setSalt, commitment, setCommitment, devMode, isChair } = useVotingCtx();
  const isVoterNormal = !devMode && !isChair;
  
  if (!devMode && isChair) return null;

  if (isVoterNormal) {
  return (
    <Section title="Vote">
      <button
        onClick={async () => {
          // Ensure a salt exists without showing it.
          actions.generateSalt();
          await actions.commitVote(selIndex);
        }}
        disabled={actions.isPending || actions.isMining}
      >
        Commit vote
      </button>
      <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
        Salt is generated and stored locally.
      </div>
    </Section>
    );
  }
  
  return (
    <Section title="Commit">
      <div style={{ marginTop: 6 }}>
        <button
          onClick={() => {
            const s = actions.generateSalt();
            setSalt(s);
          }}
        >
          Generate Salt
        </button>
        <input
          value={salt}
          onChange={(e) => setSalt(e.target.value)}
          placeholder="0x..."
          style={{ width: '70%', marginLeft: 8 }}
        />
      </div>

      <div style={{ marginTop: 6 }}>
        <button
          onClick={() => {
            actions.setErrorMsg('');
            if (!isBytes32Hex(salt)) return actions.fail('Salt must be 0x + 64 hex.');
            const c = actions.compute(selIndex, salt);
            setCommitment(c);
          }}
        >
          Compute Commitment
        </button>
        <input
          value={commitment}
          onChange={(e) => setCommitment(e.target.value)}
          placeholder="0x..."
          style={{ width: '70%', marginLeft: 8 }}
        />
      </div>

      <div style={{ marginTop: 6 }}>
        <button
          onClick={async () => {
            const res = await actions.commitVote(selIndex, salt);
            if (res?.salt) setSalt(res.salt);
            if (res?.commitment) setCommitment(res.commitment);
          }}
          disabled={actions.isPending || actions.isMining}
        >
          commitVote
        </button>
      </div>
    </Section>
  );
}
