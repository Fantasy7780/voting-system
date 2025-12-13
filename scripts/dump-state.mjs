// read current contract state: chairperson, phase, counts, deadlines, proposals, voter list with statuses

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RPC = process.env.RPC_URL || "http://127.0.0.1:8545";
const [,, CONTRACT_ADDR] = process.argv;

if (!CONTRACT_ADDR || !CONTRACT_ADDR.startsWith("0x")) {
  console.error("Usage: node scripts/dump-state.mjs <contractAddress>");
  process.exit(1);
}

const abiPath = resolve(__dirname, "../artifacts/contracts/Voting.sol/Voting.json");
const artifact = JSON.parse(await readFile(abiPath, "utf8"));
const abi = artifact.abi;

const provider = new ethers.JsonRpcProvider(RPC);
const c = new ethers.Contract(CONTRACT_ADDR, abi, provider);

const PHASE = ["Initialization","Registration","Commit","Reveal","Finalized"];

const chair = await c.chairperson();
const state = await c.state();
const rc = await c.registeredCount();
const cc = await c.committedCount();
const rv = await c.revealedCount();
const cd = await c.commitDeadline();
const rd = await c.revealDeadline();

const names = await c.proposalNames();
let results = null;
if (Number(state) === 4) {
  results = await c.results(); // [names[], votes[]]
}

let voters = [];
try {
  const addrs = await c.voterAddresses();
  for (const a of addrs) {
    const v = await c.getVoter(a);
    voters.push({
      address: a,
      registered: v[0],
      committed:  v[1],
      revealed:   v[2],
      vote:       Number(v[3]),
      commitHash: v[4]
    });
  }
} catch {

}

const iso = (sec) => sec ? new Date(Number(sec) * 1000).toISOString() : "-";

console.log("=== Contract State ===");
console.log("address        :", CONTRACT_ADDR);
console.log("chairperson    :", chair);
console.log("phase          :", Number(state), PHASE[Number(state)]);
console.log("registered     :", Number(rc));
console.log("committed      :", Number(cc));
console.log("revealed       :", Number(rv));
console.log("commitDeadline :", Number(cd), iso(cd));
console.log("revealDeadline :", Number(rd), iso(rd));
console.log("proposals      :", names);
if (results) {
  const vs = results[1].map(n => Number(n));
  console.log("votes          :", vs);
}
console.log("");

if (voters.length) {
  console.log("=== Voters ===");
  for (const v of voters) {
    console.log(`- ${v.address} | reg=${v.registered} com=${v.committed} rev=${v.revealed} vote=${v.vote} commit=${v.commitHash}`);
  }
}
