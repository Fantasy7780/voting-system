'use client';

import { Section } from './Section';
import { useVotingCtx } from '../VotingContext';

export function ChairOpsSection() {
  const {
    snapshot,
    actions,
    nextPhase,
    setNextPhase,
    registerAddr,
    setRegisterAddr,
    commitMins,
    setCommitMins,
    revealMins,
    setRevealMins,
    newProposal,
    setNewProposal,
    renameIdx,
    setRenameIdx,
    renameName,
    setRenameName,
  } = useVotingCtx();

  const phase = snapshot.phase;

  return (
    <Section title="Chairperson Ops">
      <div style={{ marginTop: 6 }}>
        next phase (1-Registration / 2-Commit / 3-Reveal / 4-Finalized):&nbsp;
        <input value={nextPhase} onChange={(e) => setNextPhase(Number(e.target.value))} style={{ width: 60 }} />
        <button
          onClick={() => actions.changeState(nextPhase)}
          disabled={actions.isPending || actions.isMining}
          style={{ marginLeft: 8 }}
        >
          changeState
        </button>
      </div>

      <div style={{ marginTop: 6 }}>
        register address:&nbsp;
        <input
          value={registerAddr}
          onChange={(e) => setRegisterAddr(e.target.value)}
          placeholder="0x..."
          style={{ width: '60%' }}
        />
        <button
          onClick={() => actions.register(registerAddr)}
          disabled={actions.isPending || actions.isMining}
          style={{ marginLeft: 8 }}
        >
          register
        </button>
      </div>

      <div style={{ marginTop: 10, opacity: phase === 1 ? 1 : 0.6 }}>
        <div style={{ marginBottom: 6 }}>
          <b>Deadlines</b> (set during Registration)
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <input
            value={commitMins}
            onChange={(e) => setCommitMins(e.target.value)}
            placeholder="commit minutes from now"
            style={{ width: 200 }}
            disabled={phase !== 1}
          />
          <input
            value={revealMins}
            onChange={(e) => setRevealMins(e.target.value)}
            placeholder="reveal minutes from now"
            style={{ width: 200 }}
            disabled={phase !== 1}
          />
          <button
            onClick={() => actions.setDeadlines(Number(commitMins), Number(revealMins))}
            disabled={actions.isPending || actions.isMining || phase !== 1}
          >
            setDeadlines
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <button onClick={() => actions.advanceIfExpired()} disabled={actions.isPending || actions.isMining}>
          advanceIfExpired
        </button>
      </div>

      {snapshot.supportsManage && (
        <div style={{ marginTop: 10, opacity: phase === 0 || phase === 1 ? 1 : 0.6 }}>
          <div style={{ marginBottom: 6 }}>
            <b>Proposals</b> (Initialization/Registration only)
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <input
              value={newProposal}
              onChange={(e) => setNewProposal(e.target.value)}
              placeholder="new proposal"
              style={{ width: '60%' }}
              disabled={!(phase === 0 || phase === 1)}
            />
            <button
              onClick={async () => {
                const ok = await actions.addProposal(newProposal);
                if (ok !== undefined) setNewProposal('');
              }}
              disabled={actions.isPending || actions.isMining || !(phase === 0 || phase === 1)}
            >
              addProposal
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={renameIdx}
              onChange={(e) => setRenameIdx(e.target.value)}
              placeholder="index"
              style={{ width: 80 }}
              disabled={!(phase === 0 || phase === 1)}
            />
            <input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="new name"
              style={{ width: '50%' }}
              disabled={!(phase === 0 || phase === 1)}
            />
            <button
              onClick={async () => {
                const ok = await actions.renameProposal(Number(renameIdx), renameName);
                if (ok !== undefined) setRenameName('');
              }}
              disabled={actions.isPending || actions.isMining || !(phase === 0 || phase === 1)}
            >
              renameProposal
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
