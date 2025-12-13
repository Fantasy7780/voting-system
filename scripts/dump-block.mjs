
// print header + all Voting txs + logs
// summarize who registered/committed/revealed in this block

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RPC = process.env.RPC_URL || "http://127.0.0.1:8545";
const [,, CONTRACT_ADDR, BLOCK_ARG = "latest"] = process.argv;

if (!CONTRACT_ADDR || !CONTRACT_ADDR.startsWith("0x")) {
  console.error("Usage: node scripts/dump-block.mjs <contractAddress> [blockNumber|latest]");
  process.exit(1);
}

const abiPath = resolve(__dirname, "../artifacts/contracts/Voting.sol/Voting.json");
const artifact = JSON.parse(await readFile(abiPath, "utf8"));
const abi = artifact.abi;
const iface = new ethers.Interface(abi);
const provider = new ethers.JsonRpcProvider(RPC);

const blockNumber = (BLOCK_ARG === "latest") ? await provider.getBlockNumber() : Number(BLOCK_ARG);
const block = await provider.getBlock(blockNumber);
const txHashes = block?.transactions || [];
const iso = (sec) => new Date(Number(sec) * 1000).toISOString();

console.log("=== Block Header ===");
console.log("number           :", block.number);
console.log("timestamp        :", block.timestamp, `(${iso(block.timestamp)})`);
console.log("parentHash       :", block.parentHash);
if (block.stateRoot)        console.log("stateRoot        :", block.stateRoot);
if (block.transactionsRoot) console.log("transactionsRoot :", block.transactionsRoot);
if (block.receiptsRoot)     console.log("receiptsRoot     :", block.receiptsRoot);
if (block.logsBloom)        console.log("logsBloom bytes  :", (block.logsBloom.length / 2) - 1);
if (block.baseFeePerGas)    console.log("baseFeePerGas    :", block.baseFeePerGas.toString());
console.log("tx count         :", txHashes.length);
console.log("");

const reg = new Set();
const commits = [];   // {voter, commitment}
const reveals = [];   // {voter, index}

for (const h of txHashes) {
  const tx = await provider.getTransaction(h);
  if (!tx) continue;
  const to = (tx.to || "").toLowerCase();
  if (to !== CONTRACT_ADDR.toLowerCase()) continue;

  console.log("--- Voting TX ---");
  console.log("hash      :", tx.hash);
  console.log("from      :", tx.from);
  console.log("to        :", tx.to);
  console.log("nonce     :", tx.nonce);
  console.log("gasLimit  :", tx.gasLimit?.toString?.() ?? "");
  console.log("value     :", tx.value?.toString?.() ?? "0");
  console.log("data bytes:", tx.data ? tx.data.length : 0);

  try {
    const parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
    console.log("method    :", parsed?.name);
    console.log("args      :", parsed?.args?.map?.(x => (typeof x === 'bigint' ? x.toString() : String(x))));
  } catch {
    console.log("method    : <unknown>");
  }

  const receipt = await provider.getTransactionReceipt(tx.hash);
  console.log("status    :", receipt.status === 1 ? "success" : "reverted");
  console.log("gasUsed   :", receipt.gasUsed?.toString?.());
  console.log("logs      :", receipt.logs.length);

  for (let i = 0; i < receipt.logs.length; i++) {
    const log = receipt.logs[i];
    if (log.address.toLowerCase() !== CONTRACT_ADDR.toLowerCase()) continue;
    try {
      const ev = iface.parseLog({ topics: log.topics, data: log.data });
      const name = ev.name;
      const args = ev.args?.map?.(x => (typeof x === 'bigint' ? x.toString() : String(x))) ?? [];
      console.log(`  [${i}] event:`, name, "args:", args);

      // summarize
      if (name === "VoterRegistered") {
        reg.add(String(args[0]).toLowerCase());
      } else if (name === "Committed") {
        commits.push({ voter: String(args[0]).toLowerCase(), commitment: String(args[1]) });
      } else if (name === "Revealed") {
        reveals.push({ voter: String(args[0]).toLowerCase(), index: Number(args[1]) });
      }
    } catch {
      console.log(`  [${i}] event: <unknown>`);
    }
  }
  console.log("");
}

console.log("=== Block Summary ===");
console.log("Registered:", reg.size, [...reg]);
console.log("Committed :", commits.length, commits);
console.log("Revealed  :", reveals.length, reveals);
