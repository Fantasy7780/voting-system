
// export one block as raw JSON 

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RPC = process.env.RPC_URL || "http://127.0.0.1:8545";
const [,, BLOCK_ARG = "latest"] = process.argv;

const provider = new ethers.JsonRpcProvider(RPC);
const blockNumber = (BLOCK_ARG === "latest") ? await provider.getBlockNumber() : Number(BLOCK_ARG);

// block header 
const block = await provider.getBlock(blockNumber);
if (!block) {
  console.error("Block not found:", blockNumber);
  process.exit(1);
}

// fetch full transactions and receipts
const txs = [];
for (const hash of (block.transactions || [])) {
  const tx = await provider.getTransaction(hash);
  const receipt = await provider.getTransactionReceipt(hash);
  txs.push({ tx, receipt });
}

// compose output
const out = {
  rpc: RPC,
  exportedAt: new Date().toISOString(),
  block,
  transactions: txs,
};

// write pretty JSON 
const outDir = resolve(__dirname, "./out");
await mkdir(outDir, { recursive: true });
const outPath = resolve(outDir, `block-${block.number}.json`);
const replacer = (_, v) => (typeof v === "bigint" ? v.toString() : v);
await writeFile(outPath, JSON.stringify(out, replacer, 2), "utf8");

console.log(outPath);
