'use client';

import { Section } from './Section';
import { useVotingCtx } from '../VotingContext';

export function RevealSection() {
  const { actions, selIndex, setSelIndex, salt, setSalt } = useVotingCtx();

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
