import { ethers } from "hardhat";

// Base Sepolia USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
// Base Mainnet USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
// Semaphore v4 on Base Sepolia: deploy your own or use PSE's deployment

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const usdc      = process.env.USDC_ADDRESS      ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const semaphore = process.env.SEMAPHORE_ADDRESS  ?? "";
  if (!semaphore) throw new Error("SEMAPHORE_ADDRESS not set");

  // VPN group: 0 = week group, 1 = month group — use separate group IDs per product
  const vpnGroupId = process.env.VPN_GROUP_ID ?? "1";
  const vpsGroupId = process.env.VPS_GROUP_ID ?? "2";

  const VPNPayment = await ethers.getContractFactory("VPNPayment");
  const vpn = await VPNPayment.deploy(usdc, semaphore, vpnGroupId, deployer.address);
  await vpn.waitForDeployment();
  console.log("VPNPayment deployed to:", await vpn.getAddress());

  const VPSPayment = await ethers.getContractFactory("VPSPayment");
  const vps = await VPSPayment.deploy(usdc, semaphore, vpsGroupId, deployer.address);
  await vps.waitForDeployment();
  console.log("VPSPayment deployed to:", await vps.getAddress());
}

main().catch((err) => { console.error(err); process.exit(1); });
