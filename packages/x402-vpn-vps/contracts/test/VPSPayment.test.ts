import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("VPSPayment", () => {
  async function deploy() {
    const [owner, user] = await ethers.getSigners();
    const usdc = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 6);
    const semaphore = await (await ethers.getContractFactory("MockSemaphore")).deploy();
    const vps = await (await ethers.getContractFactory("VPSPayment")).deploy(
      await usdc.getAddress(), await semaphore.getAddress(), 2n, owner.address);
    await usdc.mint(user.address, 100_000_000n);
    await usdc.connect(user).approve(await vps.getAddress(), ethers.MaxUint256);
    return { vps, usdc, owner, user };
  }

  // Period: HOUR=0, DAY=1, WEEK=2
  // Region: DE_FSN=0, DE_NBG=1, FI_HEL=2, PL_WAW=3, US_ASH=4, US_HIL=5, SG_SIN=6

  it("pays HOUR price ($0.25)", async () => {
    const { vps, usdc, user } = await loadFixture(deploy);
    const before = await usdc.balanceOf(user.address);
    await expect(vps.connect(user).pay(1n, 0, 0)).to.emit(vps, "ServerRequested").withArgs(0, 0, anyValue);
    expect(before - (await usdc.balanceOf(user.address))).to.equal(250_000n);
  });

  it("pays DAY price ($0.79)", async () => {
    const { vps, usdc, user } = await loadFixture(deploy);
    const before = await usdc.balanceOf(user.address);
    await vps.connect(user).pay(1n, 1, 4); // US_ASH
    expect(before - (await usdc.balanceOf(user.address))).to.equal(790_000n);
  });

  it("pays WEEK price ($3.99)", async () => {
    const { vps, usdc, user } = await loadFixture(deploy);
    const before = await usdc.balanceOf(user.address);
    await vps.connect(user).pay(1n, 2, 6); // SG_SIN
    expect(before - (await usdc.balanceOf(user.address))).to.equal(3_990_000n);
  });

  it("all 7 regions accepted", async () => {
    const { vps, user } = await loadFixture(deploy);
    for (let r = 0; r <= 6; r++) {
      await expect(vps.connect(user).pay(BigInt(r + 100), 0, r)).to.not.be.reverted;
    }
  });

  it("reverts without approval", async () => {
    const { vps } = await loadFixture(deploy);
    const [, , stranger] = await ethers.getSigners();
    await expect(vps.connect(stranger).pay(1n, 0, 0)).to.be.reverted;
  });

  it("owner can withdraw", async () => {
    const { vps, usdc, owner, user } = await loadFixture(deploy);
    await vps.connect(user).pay(1n, 0, 0);
    const before = await usdc.balanceOf(owner.address);
    await vps.connect(owner).withdraw(owner.address);
    expect(await usdc.balanceOf(owner.address)).to.equal(before + 250_000n);
  });

  it("non-owner cannot withdraw", async () => {
    const { vps, user } = await loadFixture(deploy);
    await expect(vps.connect(user).withdraw(user.address)).to.be.reverted;
  });

  it("addMemberSolana: owner can add member without payment", async () => {
    const { vps, owner } = await loadFixture(deploy);
    await expect(vps.connect(owner).addMemberSolana(999n, 1, 4)) // DAY, US_ASH
      .to.emit(vps, "ServerRequested").withArgs(1, 4, anyValue);
  });

  it("addMemberSolana: non-owner cannot call", async () => {
    const { vps, user } = await loadFixture(deploy);
    await expect(vps.connect(user).addMemberSolana(999n, 0, 0)).to.be.reverted;
  });
});
