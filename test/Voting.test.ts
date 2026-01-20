import { expect } from "chai";
import hre from "hardhat";

let ethersX: any;

// phase enum values (must match solidity enum order)
const P = {
  Initialization: 0n,
  Registration: 1n,
  Commit: 2n,
  Reveal: 3n,
  Finalized: 4n,
} as const;

type PhaseKey = keyof typeof P;

async function rpcSend(method: string, params: any[] = []) {
  return await (ethersX.provider as any).send(method, params);
}


// fixed salts (bytes32) for commit-reveal tests
const SALT_OK = "0x" + "11".repeat(32);
const SALT_BAD = "0x" + "22".repeat(32);

before(async () => {
  const connected = await (hre as any).network.connect();
  ethersX = connected.ethers;
});

// deploy a fresh voting contract
async function deployFresh(names: string[] = ["Alice", "Bob"]) {
  const [chair, a1, a2, a3, a4] = await ethersX.getSigners();
  const Voting = await ethersX.getContractFactory("Voting");
  const voting = await Voting.deploy(names);
  await voting.waitForDeployment();
  return { voting, chair, a1, a2, a3, a4 };
}

// latest block timestamp
async function nowTs(): Promise<number> {
  const b = await ethersX.provider.getBlock("latest");
  return Number(b.timestamp);
}

// mine at an exact timestamp
async function mineAt(ts: number) {
  await rpcSend("evm_setNextBlockTimestamp", [ts]);
  await rpcSend("evm_mine");
}

// move forward exactly one phase (chair only)
async function step(voting: any, chair: any, to: bigint) {
  const from = await voting.state();
  const tx = await voting.connect(chair).changeState(to);
  await expect(tx).to.emit(voting, "StateChanged").withArgs(from, to);
  expect(await voting.state()).to.equal(to);
}

// register a voter (registration only)
async function registerVoter(voting: any, chair: any, voterAddr: string) {
  const tx = await voting.connect(chair).register(voterAddr);
  await expect(tx).to.emit(voting, "VoterRegistered").withArgs(voterAddr);
}

// set valid deadlines (registration only)
async function setValidDeadlines(
  voting: any,
  chair: any,
  commitDeltaSec = 3600,
  revealDeltaSec = 7200
) {
  const t = await nowTs();
  const commitUntil = t + commitDeltaSec;
  const revealUntil = t + revealDeltaSec;
  const tx = await voting.connect(chair).setDeadlines(commitUntil, revealUntil);
  await expect(tx).to.emit(voting, "DeadlinesSet").withArgs(commitUntil, revealUntil);
  return { commitUntil, revealUntil };
}

// commit helper (uses on-chain computeCommitment)
async function doCommit(voting: any, voter: any, proposalIndex: bigint, salt: string) {
  const commitment = await voting.connect(voter).computeCommitment(proposalIndex, salt);
  const tx = await voting.connect(voter).commitVote(commitment);
  await expect(tx).to.emit(voting, "Committed").withArgs(voter.address, commitment);
  return { commitment };
}

// reveal helper
async function doReveal(voting: any, voter: any, proposalIndex: bigint, salt: string) {
  const tx = await voting.connect(voter).revealVote(proposalIndex, salt);
  await expect(tx).to.emit(voting, "Revealed").withArgs(voter.address, proposalIndex);
}

// global invariants derived from storage/counter design
async function assertInvariants(voting: any) {
  const registered = BigInt(await voting.registeredCount());
  const committed = BigInt(await voting.committedCount());
  const revealed = BigInt(await voting.revealedCount());

  expect(revealed).to.be.at.most(committed);
  expect(committed).to.be.at.most(registered);

  const addrs: string[] = await voting.voterAddresses();
  expect(BigInt(addrs.length)).to.equal(registered);

  const names: string[] = await voting.proposalNames();
  let sum = 0n;
  for (let i = 0; i < names.length; i++) {
    const p = await voting.proposals(i);
    sum += BigInt(p.voteCount);
  }
  expect(sum).to.equal(revealed);

  for (const a of addrs) {
    const v = await voting.getVoter(a);
    const vRegistered = v[0] as boolean;
    const vCommitted = v[1] as boolean;
    const vRevealed = v[2] as boolean;
    const vVote = BigInt(v[3]);
    const vCommitHash = v[4] as string;

    expect(vRegistered).to.equal(true);
    if (vCommitted) expect(vCommitHash).to.not.equal(ethersX.ZeroHash);
    if (vRevealed) {
      expect(vCommitted).to.equal(true);
      expect(vVote).to.be.at.least(0n);
      expect(vVote).to.be.lessThan(BigInt(names.length));
    }
  }
}

// build minimal valid state for a target phase
async function buildPhase(target: PhaseKey) {
  const { voting, chair, a1, a4 } = await deployFresh(["Alice", "Bob"]);
  const rv = a1; // registered voter (only guaranteed registered in phases >= commit)
  const uv = a4; // unregistered voter

  if (target === "Initialization") {
    expect(await voting.state()).to.equal(P.Initialization);
    return { voting, chair, rv, uv };
  }

  await step(voting, chair, P.Registration);

  if (target === "Registration") {
    return { voting, chair, rv, uv };
  }

  await registerVoter(voting, chair, rv.address);
  await setValidDeadlines(voting, chair, 3600, 7200);
  await step(voting, chair, P.Commit);

  if (target === "Commit") {
    return { voting, chair, rv, uv };
  }

  await doCommit(voting, rv, 0n, SALT_OK);
  await step(voting, chair, P.Reveal);

  if (target === "Reveal") {
    return { voting, chair, rv, uv };
  }

  await doReveal(voting, rv, 0n, SALT_OK);
  await step(voting, chair, P.Finalized);

  return { voting, chair, rv, uv };
}

describe("Voting - matrix + invariants", function () {
  it("sanity: deployment getters", async () => {
    const { voting, chair } = await deployFresh(["Alice", "Bob"]);
    expect(await voting.chairperson()).to.equal(chair.address);
    expect(await voting.proposalNames()).to.deep.equal(["Alice", "Bob"]);
    expect(await voting.state()).to.equal(P.Initialization);
    await assertInvariants(voting);
  });

  describe("phase * role/identity matrix", function () {
    const PHASES: PhaseKey[] = ["Initialization", "Registration", "Commit", "Reveal", "Finalized"];

    for (const phase of PHASES) {
      describe(`phase = ${phase}`, function () {
        it("register(): phase gating + zero address + duplicate", async () => {
          const { voting, chair, rv, uv } = await buildPhase(phase);

          // register(): onlyChair then inState(Registration)
          if (phase !== "Registration") {
            await expect(voting.connect(chair).register(uv.address)).to.be.revertedWith("Wrong phase");
            await expect(voting.connect(rv).register(uv.address)).to.be.revertedWith("Only chairperson");
            await assertInvariants(voting);
            return;
          }

          // success path
          await expect(voting.connect(chair).register(uv.address))
            .to.emit(voting, "VoterRegistered")
            .withArgs(uv.address);

          // duplicate register
          await expect(voting.connect(chair).register(uv.address)).to.be.revertedWith("Already registered");

          // zero address
          await expect(voting.connect(chair).register(ethersX.ZeroAddress)).to.be.revertedWith("Zero address");

          // non-chair always blocked by onlyChair first
          await expect(voting.connect(rv).register(rv.address)).to.be.revertedWith("Only chairperson");

          await assertInvariants(voting);
        });

        it("setDeadlines(): phase gating + invalid order + past + success", async () => {
          const { voting, chair, rv } = await buildPhase(phase);
          const t = await nowTs();

          // setDeadlines(): onlyChair then inState(Registration)
          if (phase !== "Registration") {
            await expect(voting.connect(chair).setDeadlines(t + 1000, t + 2000)).to.be.revertedWith("Wrong phase");
            await expect(voting.connect(rv).setDeadlines(t + 1000, t + 2000)).to.be.revertedWith("Only chairperson");
            await assertInvariants(voting);
            return;
          }

          // invalid order
          await expect(voting.connect(chair).setDeadlines(t + 2000, t + 1000)).to.be.revertedWith("Invalid deadline order");

          // commit deadline in past
          await expect(voting.connect(chair).setDeadlines(t - 1, t + 1000)).to.be.revertedWith("Commit deadline in past");

          // reveal deadline in past
          await expect(voting.connect(chair).setDeadlines(t + 1000, t - 1)).to.be.revertedWith("Reveal deadline in past");

          // success path
          await expect(voting.connect(chair).setDeadlines(t + 1000, t + 2000)).to.emit(voting, "DeadlinesSet");

          // non-chair always blocked by onlyChair first
          await expect(voting.connect(rv).setDeadlines(t + 1000, t + 2000)).to.be.revertedWith("Only chairperson");

          await assertInvariants(voting);
        });

        it("addProposal(): phase gating + empty name + success", async () => {
          const { voting, chair, rv } = await buildPhase(phase);

          // addProposal(): onlyChair then require(state in {Initialization, Registration})
          if (phase !== "Initialization" && phase !== "Registration") {
            await expect(voting.connect(chair).addProposal("X")).to.be.revertedWith("Proposals are frozen");
            await expect(voting.connect(rv).addProposal("Y")).to.be.revertedWith("Only chairperson");
            await assertInvariants(voting);
            return;
          }

          // empty name
          await expect(voting.connect(chair).addProposal("")).to.be.revertedWith("Empty name");

          // success path
          await expect(voting.connect(chair).addProposal("X")).to.emit(voting, "ProposalAdded");

          // non-chair blocked
          await expect(voting.connect(rv).addProposal("Y")).to.be.revertedWith("Only chairperson");

          await assertInvariants(voting);
        });

        it("renameProposal(): phase gating + bad index + empty name + success", async () => {
          const { voting, chair, rv } = await buildPhase(phase);

          // renameProposal(): onlyChair then require(state in {Initialization, Registration})
          if (phase !== "Initialization" && phase !== "Registration") {
            await expect(voting.connect(chair).renameProposal(0, "renamed")).to.be.revertedWith("Proposals are frozen");
            await expect(voting.connect(rv).renameProposal(0, "x")).to.be.revertedWith("Only chairperson");
            await assertInvariants(voting);
            return;
          }

          // bad index
          await expect(voting.connect(chair).renameProposal(999, "x")).to.be.revertedWith("Bad index");

          // empty name
          await expect(voting.connect(chair).renameProposal(0, "")).to.be.revertedWith("Empty name");

          // success path
          await expect(voting.connect(chair).renameProposal(0, "renamed")).to.emit(voting, "ProposalRenamed");

          // non-chair blocked
          await expect(voting.connect(rv).renameProposal(0, "x")).to.be.revertedWith("Only chairperson");

          await assertInvariants(voting);
        });

        it("commitVote(): phase gating + not registered + bad commitment + double commit + time window", async () => {
          const { voting, rv, uv } = await buildPhase(phase);
 
          // commitVote(): inState(Commit) then commitWindowOpen then require(registered) then require(!committed)
          const cRv = await voting.connect(rv).computeCommitment(0n, SALT_OK);
          const cUv = await voting.connect(uv).computeCommitment(0n, SALT_OK);

          if (phase !== "Commit") {
            await expect(voting.connect(rv).commitVote(cRv)).to.be.revertedWith("Wrong phase");
            await expect(voting.connect(uv).commitVote(cUv)).to.be.revertedWith("Wrong phase");
            await assertInvariants(voting);
            return;
          }

          // not registered (before deadline)
          await expect(voting.connect(uv).commitVote(cUv)).to.be.revertedWith("Not registered");

          // bad commitment (before deadline)
          await expect(voting.connect(rv).commitVote(ethersX.ZeroHash)).to.be.revertedWith("Bad commitment");

          // success commit
          await expect(voting.connect(rv).commitVote(cRv)).to.emit(voting, "Committed");

          // double commit (before deadline)
          await expect(voting.connect(rv).commitVote(cRv)).to.be.revertedWith("Already committed");

          // time window: after commitDeadline, commitWindowOpen fails before other checks
          const cd = Number(await voting.commitDeadline());
          await mineAt(cd + 1);
          await expect(voting.connect(rv).commitVote(cRv)).to.be.revertedWith("Commit phase ended");

          await assertInvariants(voting);
        });

        it("revealVote(): phase gating + not registered + bad index + mismatch + double reveal + time window + no commitment", async () => {
          const built: any = await buildPhase(phase);
          const { voting, chair, rv, uv } = built;

          // revealVote(): inState(Reveal) then revealWindowOpen then require(registered) then require(commitment!=0) then checks
          if (phase !== "Reveal") {
            await expect(voting.connect(rv).revealVote(0n, SALT_OK)).to.be.revertedWith("Wrong phase");
            await expect(voting.connect(uv).revealVote(0n, SALT_OK)).to.be.revertedWith("Wrong phase");
            await assertInvariants(voting);
            return;
          }

          // not registered (before deadline)
          await expect(voting.connect(uv).revealVote(0n, SALT_OK)).to.be.revertedWith("Not registered");

          // bad index
          await expect(voting.connect(rv).revealVote(999n, SALT_OK)).to.be.revertedWith("Bad index");

          // commit mismatch (rv committed with SALT_OK in buildPhase)
          await expect(voting.connect(rv).revealVote(0n, SALT_BAD)).to.be.revertedWith("Commit mismatch");

          // success reveal
          await expect(voting.connect(rv).revealVote(0n, SALT_OK)).to.emit(voting, "Revealed");

          // double reveal (before deadline)
          await expect(voting.connect(rv).revealVote(0n, SALT_OK)).to.be.revertedWith("Already revealed");

          // time window: after revealDeadline, revealWindowOpen fails before other checks
          const rd = Number(await voting.revealDeadline());
          await mineAt(rd + 1);
          await expect(voting.connect(rv).revealVote(0n, SALT_OK)).to.be.revertedWith("Reveal phase ended");

          await assertInvariants(voting);

          // no commitment case needs a separate instance: registered voter enters reveal without committing
          {
            const d = await deployFresh(["Alice", "Bob"]);
            await step(d.voting, d.chair, P.Registration);
            await registerVoter(d.voting, d.chair, d.a1.address);

            // short commit deadline, long reveal deadline
            const t = await nowTs();
            await expect(d.voting.connect(d.chair).setDeadlines(t + 100, t + 1000)).to.emit(d.voting, "DeadlinesSet");

            await step(d.voting, d.chair, P.Commit);

            // expire commit deadline to allow commit -> reveal without commits
            const cd = Number(await d.voting.commitDeadline());
            await mineAt(cd + 1);
            await step(d.voting, d.chair, P.Reveal);

            await expect(d.voting.connect(d.a1).revealVote(0n, SALT_OK)).to.be.revertedWith("No commitment");
            await assertInvariants(d.voting);
          }
        });

        it("advanceIfExpired(): phase gating + expired path", async () => {
          const { voting } = await buildPhase(phase);

          // advanceIfExpired(): only works in commit/reveal
          if (phase !== "Commit" && phase !== "Reveal") {
            await expect(voting.advanceIfExpired()).to.be.revertedWith("No auto-advance");
            await assertInvariants(voting);
            return;
          }

          // not expired baseline
          await expect(voting.advanceIfExpired()).to.be.revertedWith("Not expired");

          // expired path
          if (phase === "Commit") {
            const cd = Number(await voting.commitDeadline());
            await mineAt(cd + 1);
            await expect(voting.advanceIfExpired()).to.emit(voting, "AutoAdvanced");
            expect(await voting.state()).to.equal(P.Reveal);
            await assertInvariants(voting);
            return;
          }

          // phase === "Reveal"
          const rd = Number(await voting.revealDeadline());
          await mineAt(rd + 1);
          await expect(voting.advanceIfExpired()).to.emit(voting, "AutoAdvanced");
          expect(await voting.state()).to.equal(P.Finalized);
          await assertInvariants(voting);
        });

        it("results() / winners(): phase gating + finalized outputs", async () => {
          const { voting } = await buildPhase(phase);

          // results()/winners(): inState(Finalized)
          if (phase !== "Finalized") {
            await expect(voting.results()).to.be.revertedWith("Wrong phase");
            await expect(voting.winners()).to.be.revertedWith("Wrong phase");
            await assertInvariants(voting);
            return;
          }

          const [names, votes] = await voting.results();
          expect(names).to.deep.equal(["Alice", "Bob"]);
          expect(votes.map((x: any) => BigInt(x))).to.deep.equal([1n, 0n]);

          const winners = await voting.winners();
          expect(winners.map((x: any) => BigInt(x))).to.deep.equal([0n]);

          await assertInvariants(voting);
        });
      });
    }
  });

  it("invariant-preserving full flow (commit-reveal-finalize) with tie", async () => {
    const { voting, chair, a1, a2 } = await deployFresh(["A", "B"]);

    await assertInvariants(voting);

    await step(voting, chair, P.Registration);
    await registerVoter(voting, chair, a1.address);
    await registerVoter(voting, chair, a2.address);
    await setValidDeadlines(voting, chair, 3600, 7200);
    await assertInvariants(voting);

    await step(voting, chair, P.Commit);
    await doCommit(voting, a1, 0n, SALT_OK);
    await doCommit(voting, a2, 1n, SALT_BAD);
    await assertInvariants(voting);

    await step(voting, chair, P.Reveal);
    await doReveal(voting, a1, 0n, SALT_OK);
    await doReveal(voting, a2, 1n, SALT_BAD);
    await assertInvariants(voting);

    await step(voting, chair, P.Finalized);
    await assertInvariants(voting);

    const [names, votes] = await voting.results();
    expect(names).to.deep.equal(["A", "B"]);
    expect(votes.map((x: any) => BigInt(x))).to.deep.equal([1n, 1n]);

    const winners = await voting.winners();
    expect(winners.map((x: any) => BigInt(x))).to.deep.equal([0n, 1n]);
  });



});
  describe("Voting - changeState failures + reachable coverage checklist", function () {
  const ALL = [
    "Only chairperson",
    "Must move by one",
    "No proposals",
    "Deadlines not set",
    "Commit deadline in past",
    "Commit still open",
    "Reveal still open",
  ].sort();

  const COVERED = new Set<string>();
  function cover(msg: string) { COVERED.add(msg); }

  after(() => {
    expect([...COVERED].sort()).to.deep.equal(ALL);
  });

  it("only chairperson", async () => {
    const { voting, a1 } = await deployFresh();
    await expect(voting.connect(a1).changeState(P.Registration)).to.be.revertedWith("Only chairperson");
    cover("Only chairperson");
  });

  it("must move by one", async () => {
    const { voting, chair } = await deployFresh();
    await expect(voting.connect(chair).changeState(P.Commit)).to.be.revertedWith("Must move by one");
    cover("Must move by one");
  });

  it("no proposals", async () => {
    const { voting, chair } = await deployFresh([]);
    await step(voting, chair, P.Registration);
    await expect(voting.connect(chair).changeState(P.Commit)).to.be.revertedWith("No proposals");
    cover("No proposals");
  });

  it("deadlines not set", async () => {
    const { voting, chair } = await deployFresh(["x"]);
    await step(voting, chair, P.Registration);
    await expect(voting.connect(chair).changeState(P.Commit)).to.be.revertedWith("Deadlines not set");
    cover("Deadlines not set");
  });

  it("commit deadline in past (changeState to commit after deadline passes)", async () => {
    const { voting, chair } = await deployFresh(["x"]);
    await step(voting, chair, P.Registration);

    const t = await nowTs();
    await voting.connect(chair).setDeadlines(t + 2, t + 10);

    await mineAt(t + 3);
    await expect(voting.connect(chair).changeState(P.Commit)).to.be.revertedWith("Commit deadline in past");
    cover("Commit deadline in past");
  });

  it("commit still open (commit -> reveal blocked)", async () => {
    const { voting, chair, a1 } = await deployFresh(["x"]);
    await step(voting, chair, P.Registration);

    await registerVoter(voting, chair, a1.address);
    await setValidDeadlines(voting, chair, 1000, 2000);

    await step(voting, chair, P.Commit);

    await expect(voting.connect(chair).changeState(P.Reveal)).to.be.revertedWith("Commit still open");
    cover("Commit still open");
  });

  it("reveal still open (reveal -> finalized blocked)", async () => {
    const { voting, chair, a1 } = await deployFresh(["x"]);
    await step(voting, chair, P.Registration);

    await registerVoter(voting, chair, a1.address);
    await setValidDeadlines(voting, chair, 1000, 2000);

    await step(voting, chair, P.Commit);
    await doCommit(voting, a1, 0n, SALT_OK);

    await step(voting, chair, P.Reveal);

    await expect(voting.connect(chair).changeState(P.Finalized)).to.be.revertedWith("Reveal still open");
    cover("Reveal still open");
  });

});
