'use client';

import { useEffect, useState } from 'react';
import { VotingProvider } from './VotingContext';
import { Banner } from './components/Banner';
import { WalletSection } from './components/WalletSection';
import { ContractSection } from './components/ContractSection';
import { NewRoundSection } from './components/NewRoundSection';
import { StatusSection } from './components/StatusSection';
import { ChairOpsSection } from './components/ChairOpsSection';
import { ChoiceSection } from './components/ChoiceSection';
import { CommitSection } from './components/CommitSection';
import { RevealSection } from './components/RevealSection';
import { ResultsSection } from './components/ResultsSection';
import { WinnersSection } from './components/WinnersSection';
import { DebugSection } from './components/DebugSection';
import { BackupSection } from './components/BackupSection';

export default function VotingPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{ maxWidth: 900, margin: '40px auto', fontFamily: 'system-ui, sans-serif' }}>
        <h2>Voting (commit–reveal)</h2>
        <div
          style={{
            background: '#eef6ff',
            color: '#084298',
            padding: '8px 12px',
            border: '1px solid #b6daff',
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          Loading wallet UI…
        </div>
      </div>
    );
  }

  return (
    <VotingProvider>
      <div style={{ maxWidth: 900, margin: '40px auto', fontFamily: 'system-ui, sans-serif' }}>
        <h2>Voting (commit–reveal)</h2>

        <Banner />

        <WalletSection />
        <ContractSection />
        <NewRoundSection />
        <StatusSection />
        <ChairOpsSection />
        <ChoiceSection />
        <CommitSection />
        <RevealSection />
        <ResultsSection />
        <WinnersSection />
        <DebugSection />
        <BackupSection />
      </div>
    </VotingProvider>
  );
}
