// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

//Flow: Initialization -> Registration -> Commit -> Reveal -> Finalized.
contract Voting {
    // =============================================================
    // Data Types
    // =============================================================

    struct Proposal {
        string name;
        uint256 voteCount;
    }

    // address 
    struct Voter {
        bool registered;
        bool committed;
        bool revealed;
        uint256 vote; // valid if revealed, index of proposal
        bytes32 commitHash; // keccak256(index, salt, voter, contract, chainId)
    }

    enum Phase {
        Initialization,
        Registration,
        Commit,
        Reveal,
        Finalized
    }

    // =============================================================
    // State Variables
    // =============================================================

    address public chairperson;
    Phase public state = Phase.Initialization; // current state

    mapping(address => Voter) public voters;
    address[] private _voterAddrs; // all registered addresses
    Proposal[] public proposals;

    uint256 public registeredCount;
    uint256 public committedCount;
    uint256 public revealedCount;

    uint256 public commitDeadline;
    uint256 public revealDeadline;

    // =============================================================
    // Events
    // =============================================================

    event StateChanged(Phase from, Phase to);
    event AutoAdvanced(Phase from, Phase to);

    event VoterRegistered(address voter);
    event Committed(address voter, bytes32 commitment);
    event Revealed(address voter, uint256 proposalIndex);

    event ProposalAdded(uint256 index, string name);
    event ProposalRenamed(uint256 index, string oldName, string newName);

    event DeadlinesSet(uint256 commitUntil, uint256 revealUntil);

    // =============================================================
    // Modifiers
    // =============================================================

    modifier onlyChair() {
        require(msg.sender == chairperson, "Only chairperson");
        _;
    }

    modifier inState(Phase p) {
        require(state == p, "Wrong phase");
        _;
    }

    modifier commitWindowOpen() {
        require(commitDeadline != 0, "Commit deadline not set");
        require(block.timestamp <= commitDeadline, "Commit phase ended");
        _;
    }

    modifier revealWindowOpen() {
        require(revealDeadline != 0, "Reveal deadline not set");
        require(block.timestamp <= revealDeadline, "Reveal phase ended");
        _;
    }

    // =============================================================
    // Constructor
    // =============================================================

    // an initial list of proposal names
    constructor(string[] memory names) {
        chairperson = msg.sender;// the chosen one to be chairperson
        for (uint256 i = 0; i < names.length; ++i) {
            proposals.push(Proposal(names[i], 0));
        }
    }

    // =============================================================
    // State Control
    // =============================================================

    /// only forward
    function changeState(Phase newState) 
        external 
        onlyChair 
    {
        require(uint8(newState) == uint8(state) + 1, "Must move by one");

        if (newState == Phase.Commit) {
            require(proposals.length > 0, "No proposals");
            require(commitDeadline != 0 && revealDeadline != 0, "Deadlines not set");
            require(commitDeadline < revealDeadline, "Invalid deadline order");
            require(commitDeadline > block.timestamp, "Commit deadline in past");
        } else if (newState == Phase.Reveal) {
            require(commitDeadline != 0, "Commit deadline not set");
            require(block.timestamp > commitDeadline || committedCount == registeredCount, "Commit still open");
        } else if (newState == Phase.Finalized) {
            require(revealDeadline != 0, "Reveal deadline not set");
            require(block.timestamp > revealDeadline || revealedCount == committedCount, "Reveal still open");
        }

        Phase old = state;
        state = newState;

        emit StateChanged(old, newState);// write it to log
    }

    // advance phase automatically when deadlines are reached
    function advanceIfExpired() 
        external 
    {
        if (state == Phase.Commit) {
            require(
                commitDeadline != 0 && block.timestamp > commitDeadline,
                "Not expired"
            );

            Phase old = state;
            state = Phase.Reveal;
            
            emit AutoAdvanced(old, state);// not sure if both emits are needed
            emit StateChanged(old, state);

        } else if (state == Phase.Reveal) {
            require(
                revealDeadline != 0 && block.timestamp > revealDeadline,
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


    // =============================================================
    // Registration
    // =============================================================

    // register a voter address during the Registration phase
    function register(address voterAddr) 
        external 
        onlyChair 
        inState(Phase.Registration) 
    {
        require(voterAddr != address(0), "Zero address");
        require(!voters[voterAddr].registered, "Already registered");

        voters[voterAddr].registered = true;
        registeredCount += 1;
        _voterAddrs.push(voterAddr);

        emit VoterRegistered(voterAddr);
    }

    // =============================================================
    // Proposals
    // =============================================================
    
    // add a proposal during Initialization or Registration
    function addProposal(string calldata name) 
        external 
        onlyChair 
    {
        require(
            state == Phase.Initialization || state == Phase.Registration,
            "Proposals are frozen"
        );// after Initialization or Registration freeze all proposals
        require(bytes(name).length > 0, "Empty name");

        proposals.push(Proposal(name, 0));
        
        emit ProposalAdded(proposals.length - 1, name);
    }

    // find proposal with index idx and rename it newName
    function renameProposal(uint256 idx, string calldata newName) 
        external 
        onlyChair 
    {
        require(
            state == Phase.Initialization || state == Phase.Registration,
            "Proposals are frozen"
        );// after Initialization or Registration freeze all proposals
        require(idx < proposals.length, "Bad index");
        require(bytes(newName).length > 0, "Empty name");

        string memory old = proposals[idx].name;
        proposals[idx].name = newName;

        emit ProposalRenamed(idx, old, newName);
    }

    // =============================================================
    // Deadlines
    // =============================================================
    
    // set commit and reveal deadlines during Registration
    function setDeadlines(uint256 commitUntil, uint256 revealUntil) 
        external 
        onlyChair 
        inState(Phase.Registration) 
    {
        require(commitUntil > block.timestamp, "Commit deadline in past");
        require(revealUntil > block.timestamp, "Reveal deadline in past");
        require(commitUntil < revealUntil, "Invalid deadline order"); // commitUntil must be before revealUntil.

        commitDeadline = commitUntil;
        revealDeadline = revealUntil;

        emit DeadlinesSet(commitUntil, revealUntil);
    }

    // =============================================================
    // Voting: Commit
    // =============================================================

    //hash is stored and later checked in revealVote
    function commitVote(bytes32 commitment) 
        external 
        inState(Phase.Commit) 
        commitWindowOpen 
    {
        Voter storage v = voters[msg.sender];

        require(v.registered, "Not registered");
        require(!v.committed, "Already committed");
        require(commitment != bytes32(0), "Bad commitment");

        v.committed = true;
        v.commitHash = commitment;
        committedCount += 1;

        emit Committed(msg.sender, commitment);
    }

    // =============================================================
    // Voting: Reveal
    // =============================================================

    function revealVote(uint256 proposalIndex, bytes32 salt) 
        external 
        inState(Phase.Reveal)  
        revealWindowOpen 
    {
        Voter storage v = voters[msg.sender];

        require(v.registered, "Not registered");
        require(v.committed, "No commitment");
        require(!v.revealed, "Already revealed");
        require(proposalIndex < proposals.length, "Bad index");

        bytes32 recomputed = keccak256(
            abi.encode(proposalIndex, salt, msg.sender, address(this), block.chainid)
        );// compute and compare
        require(recomputed == v.commitHash, "Commit mismatch");

        v.revealed = true;
        v.vote = proposalIndex;

        proposals[proposalIndex].voteCount += 1;
        revealedCount += 1;

        emit Revealed(msg.sender, proposalIndex);
    }

    // =============================================================
    // Views: Voters
    // =============================================================

    // return the list of registered voter addresses
    function voterAddresses() 
        external 
        view 
        returns (address[] memory) 
    {
        return _voterAddrs;
    }

    // return voter status and stored data for an address
    function getVoter(address a)
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

    // =============================================================
    // Views: Proposals
    // =============================================================

    // return all proposal names
    function proposalNames() 
        external 
        view 
        returns (string[] memory names) 
    {
        uint256 len = proposals.length;
        names = new string[](len);

        for (uint256 i = 0; i < len; ++i) 
        {
            names[i] = proposals[i].name;
        }
    }

    // =============================================================
    // Helpers
    // =============================================================

    // compute a commitment hash for the caller
    function computeCommitment(uint256 index,bytes32 salt) 
        external 
        view 
        returns (bytes32) 
    {
        return keccak256(
            abi.encode(
                index,
                salt,
                msg.sender,
                address(this),
                block.chainid
            )
        );
    }

    // =============================================================
    // Results
    // =============================================================

    // return all proposal names and vote counts
    function results()
        external
        view
        inState(Phase.Finalized)
        returns (string[] memory names, uint256[] memory votes)
    {
        uint256 len = proposals.length;
        names = new string[](len);
        votes = new uint256[](len);

        for (uint256 i = 0; i < len; ++i) 
        {
            names[i] = proposals[i].name;
            votes[i] = proposals[i].voteCount;
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
        for (uint256 i = 0; i < proposals.length; ++i) 
        {
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

        for (uint256 i = 0; i < proposals.length; ++i) 
        {
            if (proposals[i].voteCount == hi) 
            {
                idxs[k++] = i;
            }
        }
    }
}
