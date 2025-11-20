import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const VotingModule = buildModule("VotingModule", (m) => {
    const names = m.getParameter("names", ["Alice", "Bob", "Carol"]);
    const voting = m.contract("Voting", [names]); 
    return { voting };
});

export default VotingModule;
