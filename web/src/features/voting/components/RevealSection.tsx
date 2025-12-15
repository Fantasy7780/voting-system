'use client';

import { Section } from './Section';
import { useVotingCtx } from '../VotingContext';

export function RevealSection() {
  const { actions, selIndex, setSelIndex, salt, setSalt, devMode, isChair } = useVotingCtx();
  const isVoterNormal = !devMode && !isChair;

  if (!devMode && isChair) return null;

  if (isVoterNormal) 
  return (
    <Section title="Vote">
      <button
        onClick={async () => {
          await actions.revealVote(selIndex);
        }}
        disabled={actions.isPending || actions.isMining}
      >
        Reveal vote
      </button>
      <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
        Reveal uses saved meta / local salt automatically.
      </div>
    </Section>
  );
  
  
  return (
    <Section title="Reveal">
      <button
        onClick={async () => {
          const res = await actions.revealVote(selIndex, salt);
          if (res?.salt) setSalt(res.salt);
          if (typeof res?.index === 'number') setSelIndex(res.index);
        }}
        disabled={actions.isPending || actions.isMining}
      >
        revealVote
      </button>
    </Section>
  );
}
