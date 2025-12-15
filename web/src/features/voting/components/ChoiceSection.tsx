'use client';

import { Section } from './Section';
import { useVotingCtx } from '../VotingContext';

export function ChoiceSection() {
  const { snapshot, selIndex, setSelIndex, devMode, isChair } = useVotingCtx();

  if (!devMode && isChair) return null;

  return (
    <Section title="Your Choice">
      <select value={selIndex} onChange={(e) => setSelIndex(Number(e.target.value))}>
        {snapshot.names.map((n, i) => (
          <option key={i} value={i}>
            {i} - {n}
          </option>
        ))}
      </select>
    </Section>
  );
}
