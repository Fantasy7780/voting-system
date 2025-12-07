// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Voting {
    struct Proposal {
        string name;
        uint256 voteCount;
    }

    struct Voter {
        bool registered;
        bool committed;
        bool revealed;
        uint256 vote; // valid if revealed
        bytes32 commitHash; // keccak256(index, salt, voter, contract, chainId)
    }

    enum Phase {
        Initialization,
        Registration,
        Commit,
        Reveal,
        Finalized
    }

    address public chairman;
    Phase public state = Phase.Initialization;

    mapping(address => Voter) public voters;
    address[] private _voterAddrs;
    Proposal[] public proposals;

    uint256 public registeredCount;
    uint256 public committedCount;
    uint256 public revealedCount;

    uint256 public commitDeadline;
    uint256 public revealDeadline;

    event StateChanged(Phase from, Phase to);
    event VoterRegistered(address voter);
    event Committed(address voter, bytes32 commitment);
    event Revealed(address voter, uint256 proposalIndex);

    event ProposalAdded(uint256 index, string name);
    event ProposalRenamed(uint256 index, string oldName, string newName);

    event DeadlinesSet(uint256 commitUntil, uint256 revealUntil);
    event AutoAdvanced(Phase from, Phase to);

    modifier onlyChair() {
        require(msg.sender == chairman, "Only chairman");
        _;
    }
    modifier inState(Phase p) {
        require(state == p, "Wrong phase");
        _;
    }

    modifier commitWindowOpen() {
        require(commitDeadline != 0, "Commit deadline not set");
        require(block.timestamp < commitDeadline, "Commit phase ended");
        _;
    }

    modifier revealWindowOpen() {
        require(revealDeadline != 0, "Reveal deadline not set");
        require(block.timestamp < revealDeadline, "Reveal phase ended");
        _;
    }

    constructor(string[] memory names) {
        chairman = msg.sender;
        for (uint256 i = 0; i < names.length; ++i) {
            proposals.push(Proposal(names[i], 0));
        }
    }

    /// only forward
    function changeState(Phase newState) external onlyChair {
        require(uint8(newState) == uint8(state) + 1, "Must move by one");

        if (newState == Phase.Commit) {
            require(proposals.length > 0, "No proposals");
            require(commitDeadline != 0 && revealDeadline != 0, "Deadlines not set");
            require(commitDeadline < revealDeadline, "order");
            require(commitDeadline > block.timestamp, "commit in past");
        } else if (newState == Phase.Reveal) {
            require(commitDeadline != 0, "Commit deadline not set");
            require(block.timestamp >= commitDeadline, "Commit still open");
        } else if (newState == Phase.Finalized) {
            require(revealDeadline != 0, "Reveal deadline not set");
            require(block.timestamp >= revealDeadline, "Reveal still open");
        }

        Phase old = state;
        state = newState;
        emit StateChanged(old, newState);
    }

    // registration
    function register(
        address voterAddr
    ) external onlyChair inState(Phase.Registration) {
        require(voterAddr != address(0), "Zero address");
        require(!voters[voterAddr].registered, "Already registered");
        voters[voterAddr].registered = true;
        registeredCount += 1;
        _voterAddrs.push(voterAddr);
        emit VoterRegistered(voterAddr);
    }

    // add a proposal
    function addProposal(string calldata name) external onlyChair {
        require(
            state == Phase.Initialization || state == Phase.Registration,
            "Frozen"
        );
        proposals.push(Proposal(name, 0));
        emit ProposalAdded(proposals.length - 1, name);
    }

    function renameProposal(
        uint256 idx,
        string calldata newName
    ) external onlyChair {
        require(
            state == Phase.Initialization || state == Phase.Registration,
            "Frozen"
        );
        require(idx < proposals.length, "Bad index");
        string memory old = proposals[idx].name;
        proposals[idx].name = newName;
        emit ProposalRenamed(idx, old, newName);
    }

    // deadlines
    function setDeadlines(
        uint256 commitUntil,
        uint256 revealUntil
    ) external onlyChair inState(Phase.Registration) {
        require(commitUntil > block.timestamp, "commit in past");
        require(revealUntil > block.timestamp, "reveal in past");
        require(commitUntil < revealUntil, "order");
        commitDeadline = commitUntil;
        revealDeadline = revealUntil;
        emit DeadlinesSet(commitUntil, revealUntil);
    }

    /// advance phase automatically when deadlines are reached
    function advanceIfExpired() external {
        if (state == Phase.Commit) {
            require(
                commitDeadline != 0 && block.timestamp >= commitDeadline,
                "Not expired"
            );
            Phase old = state;
            state = Phase.Reveal;
            emit AutoAdvanced(old, state);
            emit StateChanged(old, state);
        } else if (state == Phase.Reveal) {
            require(
                revealDeadline != 0 && block.timestamp >= revealDeadline,
                "Not expired"
            );
            Phase old2 = state;
            state = Phase.Finalized;
            emit AutoAdvanced(old2, state);
            emit StateChanged(old2, state);
        } else {
            revert("No auto-advance");
        }
    }

    function commitVote(bytes32 commitment) external inState(Phase.Commit) {
        Voter storage v = voters[msg.sender];
        require(v.registered, "Not registered");
        require(!v.committed, "Already committed");
        require(commitment != bytes32(0), "Bad commitment");
        v.committed = true;
        v.commitHash = commitment;
        committedCount += 1;
        emit Committed(msg.sender, commitment);
    }

    function revealVote(
        uint256 proposalIndex,
        bytes32 salt
    ) external inState(Phase.Reveal) revealWindowOpen {
        Voter storage v = voters[msg.sender];
        require(v.registered, "Not registered");
        require(v.committed, "No commitment");
        require(!v.revealed, "Already revealed");
        require(proposalIndex < proposals.length, "Bad index");

        bytes32 recomputed = keccak256(
            abi.encode(proposalIndex, salt, msg.sender, address(this), block.chainid)
        );
        require(recomputed == v.commitHash, "Commit mismatch");

        v.revealed = true;
        v.vote = proposalIndex;
        proposals[proposalIndex].voteCount += 1;
        revealedCount += 1;
        emit Revealed(msg.sender, proposalIndex);
    }

    // views

    function voterAddresses() external view returns (address[] memory) {
        return _voterAddrs;
    }

    function getVoter(
        address a
    )
        external
        view
        returns (
            bool registered,
            bool committed,
            bool revealed,
            uint256 vote,
            bytes32 commitHash
        )
    {
        Voter storage v = voters[a];
        return (v.registered, v.committed, v.revealed, v.vote, v.commitHash);
    }

    function proposalNames() external view returns (string[] memory names) {
        uint256 len = proposals.length;
        names = new string[](len);
        for (uint256 i = 0; i < len; ++i) names[i] = proposals[i].name;
    }

    function computeCommitment(
        uint256 index,
        bytes32 salt
    ) external view returns (bytes32) {
        return
            keccak256(
                abi.encode(index, salt, msg.sender, address(this), block.chainid)
            );
    }

    // tie handling
    function results()
        external
        view
        inState(Phase.Finalized)
        returns (string[] memory names, uint256[] memory votes)
    {
        uint256 len = proposals.length;
        names = new string[](len);
        votes = new uint256[](len);
        for (uint256 i = 0; i < len; ++i) {
            names[i] = proposals[i].name;
            votes[i] = proposals[i].voteCount;
        }
    }

    function winningProposal()
        public
        view
        inState(Phase.Finalized)
        returns (uint256 idx)
    {
        require(proposals.length > 0, "No proposals");
        uint256 highest;
        for (uint256 i = 0; i < proposals.length; ++i) {
            if (proposals[i].voteCount > highest) {
                highest = proposals[i].voteCount;
                idx = i;
            }
        }
    }

    /// return all winner indices in case of ties
    function winners()
        external
        view
        inState(Phase.Finalized)
        returns (uint256[] memory idxs)
    {
        uint256 hi;
        uint256 n;
        for (uint256 i = 0; i < proposals.length; ++i) {
            uint256 v = proposals[i].voteCount;
            if (v > hi) {
                hi = v;
                n = 1;
            } else if (v == hi) {
                n++;
            }
        }
        idxs = new uint256[](n);
        uint256 k;
        for (uint256 i = 0; i < proposals.length; ++i) {
            if (proposals[i].voteCount == hi) idxs[k++] = i;
        }
    }

    function winnerName()
        external
        view
        inState(Phase.Finalized)
        returns (string memory)
    {
        require(proposals.length > 0, "No proposals");
        return proposals[winningProposal()].name;
    }
}
