// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;


contract Voting {
    struct Proposal { string name; uint256 voteCount; }

    struct Voter {
        bool registered;
        bool committed;
        bool revealed;
        uint256 vote;       // valid if revealed
        bytes32 commitHash; // keccak256(index, salt, contract, chainId)
    }

    enum Phase { Initialization, Registration, Commit, Reveal, Finalized }

    address public chairman;
    Phase public state = Phase.Initialization;

    mapping(address => Voter) public voters;
    address[] private _voterAddrs;
    Proposal[] public proposals;

    uint256 public registeredCount;
    uint256 public committedCount;
    uint256 public revealedCount;

    event StateChanged(Phase from, Phase to);
    event VoterRegistered(address voter);
    event Committed(address voter, bytes32 commitment);
    event Revealed(address voter, uint256 proposalIndex);

    modifier onlyChair() { require(msg.sender == chairman, "Only chairman"); _; }
    modifier inState(Phase p) { require(state == p, "Wrong phase"); _; }

    constructor(string[] memory names) {
        chairman = msg.sender; // not auto-registered
        for (uint256 i = 0; i < names.length; ++i) {
            proposals.push(Proposal(names[i], 0));
        }
    }

    /// only forward
    function changeState(Phase newState) external onlyChair {
        require(uint8(newState) == uint8(state) + 1, "Must move by one");
        Phase old = state;
        state = newState;
        emit StateChanged(old, newState);
    }

    // registration
    function register(address voterAddr) external onlyChair inState(Phase.Registration) {
        require(!voters[voterAddr].registered, "Already registered");
        voters[voterAddr].registered = true;
        registeredCount += 1;
        _voterAddrs.push(voterAddr);
        emit VoterRegistered(voterAddr);
    }

    // add a proposal
    function addProposal(string calldata name) external onlyChair {
        require(state == Phase.Initialization || state == Phase.Registration, "Frozen");
        proposals.push(Proposal(name, 0));
    }

    // rename a proposal 
    function renameProposal(uint256 idx, string calldata newName) external onlyChair {
        require(state == Phase.Initialization || state == Phase.Registration, "Frozen");
        require(idx < proposals.length, "Bad index");
        proposals[idx].name = newName;
    }

   
    // commitment
    function commitVote(bytes32 commitment) external inState(Phase.Commit) {
        Voter storage v = voters[msg.sender];
        require(v.registered, "Not registered");
        require(!v.committed, "Already committed");
        v.committed = true;
        v.commitHash = commitment;
        committedCount += 1;
        emit Committed(msg.sender, commitment);
    }

    // reveal 
    function revealVote(uint256 proposalIndex, bytes32 salt) external inState(Phase.Reveal) {
        Voter storage v = voters[msg.sender];
        require(v.registered, "Not registered");
        require(v.committed, "No commitment");
        require(!v.revealed, "Already revealed");
        require(proposalIndex < proposals.length, "Bad index");

        bytes32 recomputed =
            keccak256(abi.encodePacked(proposalIndex, salt, address(this), block.chainid));
        require(recomputed == v.commitHash, "Commit mismatch");

        v.revealed = true;
        v.vote = proposalIndex;
        proposals[proposalIndex].voteCount += 1;
        revealedCount += 1;
        emit Revealed(msg.sender, proposalIndex);
    }

    // views

    function voterAddresses() external view returns (address[] memory) { return _voterAddrs; }

    function proposalNames() external view returns (string[] memory names) {
        uint256 len = proposals.length;
        names = new string[](len);
        for (uint256 i = 0; i < len; ++i) names[i] = proposals[i].name;
    }

    function computeCommitment(uint256 index, bytes32 salt) external view returns (bytes32) {
        return keccak256(abi.encodePacked(index, salt, address(this), block.chainid));
    }

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

    function winningProposal() public view inState(Phase.Finalized) returns (uint256 idx) {
        uint256 highest;
        for (uint256 i = 0; i < proposals.length; ++i) {
            if (proposals[i].voteCount > highest) { highest = proposals[i].voteCount; idx = i; }
        }
    }

    function winnerName() external view inState(Phase.Finalized) returns (string memory) {
        return proposals[winningProposal()].name;
    }
}
