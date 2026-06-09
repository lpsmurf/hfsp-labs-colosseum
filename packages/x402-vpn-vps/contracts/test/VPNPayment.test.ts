import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("VPNPayment", () => {
  async function deploy() {
    const [owner, user] = await ethers.getSigners();
    const usdc = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 6);
    const semaphore = await (await ethers.getContractFactory("MockSemaphore")).deploy();
    const vpn = await (await ethers.getContractFactory("VPNPayment")).deploy(
      await usdc.getAddress(), await semaphore.getAddress(), 1n, owner.address);
    await usdc.mint(user.address, 100_000_000n);
    await usdc.connect(user).approve(await vpn.getAddress(), ethers.MaxUint256);
    return { vpn, usdc, owner, user };
  }

  // Period: HOUR=0, DAY=1, WEEK=2, MONTH=3
  it("pays HOUR price ($0.20)", async () => {
    const { vpn, usdc, user } = await loadFixture(deploy);
    const before = await usdc.balanceOf(user.address);
    await expect(vpn.connect(user).pay(1n, 0)).to.emit(vpn, "AccessPurchased").withArgs(0, anyValue);
    expect(before - (await usdc.balanceOf(user.address))).to.equal(200_000n);
  });

  it("pays DAY price ($0.79)", async () => {
    const { vpn, usdc, user } = await loadFixture(deploy);
    const before = await usdc.balanceOf(user.address);
    await vpn.connect(user).pay(1n, 1);
    expect(before - (await usdc.balanceOf(user.address))).to.equal(790_000n);
  });

  it("pays WEEK price ($2.99)", async () => {
    const { vpn, usdc, user } = await loadFixture(deploy);
    const before = await usdc.balanceOf(user.address);
    await vpn.connect(user).pay(1n, 2);
    expect(before - (await usdc.balanceOf(user.address))).to.equal(2_990_000n);
  });

  it("pays MONTH price ($7.99)", async () => {
    const { vpn, usdc, user } = await loadFixture(deploy);
    const before = await usdc.balanceOf(user.address);
    await vpn.connect(user).pay(1n, 3);
    expect(before - (await usdc.balanceOf(user.address))).to.equal(7_990_000n);
  });

  it("reverts without approval", async () => {
    const { vpn } = await loadFixture(deploy);
    const [, , stranger] = await ethers.getSigners();
    await expect(vpn.connect(stranger).pay(1n, 0)).to.be.reverted;
  });

  it("owner can withdraw", async () => {
    const { vpn, usdc, owner, user } = await loadFixture(deploy);
    await vpn.connect(user).pay(1n, 0);
    const before = await usdc.balanceOf(owner.address);
    await vpn.connect(owner).withdraw(owner.address);
    expect(await usdc.balanceOf(owner.address)).to.equal(before + 200_000n);
  });

  it("non-owner cannot withdraw", async () => {
    const { vpn, user } = await loadFixture(deploy);
    await expect(vpn.connect(user).withdraw(user.address)).to.be.reverted;
  });

  it("addMemberSolana: owner can add member without payment", async () => {
    const { vpn, owner } = await loadFixture(deploy);
    await expect(vpn.connect(owner).addMemberSolana(999n, 2))
      .to.emit(vpn, "AccessPurchased").withArgs(2, anyValue);
  });

  it("addMemberSolana: non-owner cannot call", async () => {
    const { vpn, user } = await loadFixture(deploy);
    await expect(vpn.connect(user).addMemberSolana(999n, 0)).to.be.reverted;
  });
});
