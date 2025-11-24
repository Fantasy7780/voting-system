import { expect } from "chai";
import hre from "hardhat";

let ethersX: any;
before(async () => {
  const connected = await (hre as any).network.connect();
  ethersX = connected.ethers;
});

async function deployFresh() {
  const [chair, a1, a2, a3] = await ethersX.getSigners();
  const Voting = await ethersX.getContractFactory("Voting");
  const voting = await Voting.deploy(["Alice", "Bob"]);
  await voting.waitForDeployment();
  const chainId = (await ethersX.provider.getNetwork()).chainId;
  return { voting, chair, a1, a2, a3, chainId };
}

describe("Voting (commit-reveal)", function () {
  it("deploys and loads initial proposals", async () => {
    const { voting, chair } = await deployFresh();
    expect(await voting.chairman()).to.equal(chair.address);
    const names = await voting.proposalNames();
    expect(names).to.deep.equal(["Alice", "Bob"]);
    expect(await voting.state()).to.equal(0n); 
  });

});
