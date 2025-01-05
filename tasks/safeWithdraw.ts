import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import ZRC20ABI from "@zetachain/protocol-contracts/abi/ZRC20.sol/ZRC20.json";
import * as dotenv from "dotenv";

dotenv.config();

const main = async (args: any, hre: HardhatRuntimeEnvironment) => {
  const { ethers } = hre;
  const [signer] = await ethers.getSigners();

  if (!signer) {
    throw new Error(
      `Wallet not found. Please, run "npx hardhat account --save" or set the PRIVATE_KEY env variable in a .env file.`
    );
  }

  console.log("Preparing withdrawal process...");

  // Retrieve addresses from .env or CLI arguments
  const zrc20Address = args.zrc20 || process.env.ZRC20_ETH_ADDRESS;
  const wrapperAddress = args.contract || process.env.ZRC20WRAPPER_ADDRESS;

  if (!zrc20Address || !wrapperAddress) {
    throw new Error(
      "ZRC20 or ZRC20Wrapper address not found. Ensure they are set in the .env file or passed as arguments."
    );
  }

  // Retrieve the contract instances
  const zrc20 = new ethers.Contract(zrc20Address, ZRC20ABI.abi, signer);
  const zrc20Wrapper = await ethers.getContractAt(
    "ZRC20Wrapper",
    wrapperAddress,
    signer
  );

  console.log("Fetching token decimals...");
  const tokenDecimals = await zrc20.decimals();

  // Parameters
  const recipient = args.to || signer.address; // Recipient address
  const amount = ethers.utils.parseUnits(args.amount, tokenDecimals); // Amount to withdraw

  // Fetch gas fee and gas ZRC20 token
  console.log("Fetching gas fee for withdrawal...");
  const [gasZRC20, rawGasFee] = await zrc20.withdrawGasFee();

  // Handle gas token decimals
  const gasZRC20Contract = new ethers.Contract(gasZRC20, ZRC20ABI.abi, signer);
  const gasTokenDecimals = await gasZRC20Contract.decimals();
  const gasFee = ethers.utils.parseUnits(
    ethers.utils.formatUnits(rawGasFee, gasTokenDecimals),
    gasTokenDecimals
  );

  console.log(
    `Gas token: ${gasZRC20}, Gas fee: ${ethers.utils.formatUnits(
      gasFee,
      gasTokenDecimals
    )}`
  );

  // Revert options
  const revertOptions = {
    revertAddress: args.revertAddress || signer.address,
    callOnRevert: args.callOnRevert || false,
    abortAddress: args.abortAddress || ethers.constants.AddressZero,
    revertMessage: ethers.utils.hexlify(
      ethers.utils.toUtf8Bytes(args.revertMessage || "Revert occurred")
    ),
    onRevertGasLimit: args.onRevertGasLimit || 7000000,
  };

  // Approve gas fee
  console.log("Approving gas fee...");
  const gasApproval = await gasZRC20Contract.approve(
    wrapperAddress,
    gasZRC20 === zrc20Address ? gasFee.add(amount) : gasFee
  );
  await gasApproval.wait();
  console.log("Gas fee approved.");

  // Approve the target token if different from gas token
  if (gasZRC20 !== zrc20Address) {
    console.log("Approving target token...");
    const tokenApproval = await zrc20.approve(wrapperAddress, amount);
    await tokenApproval.wait();
    console.log("Target token approved.");
  }

  console.log(
    `Initiating withdrawal with revert options:
    Contract: ${wrapperAddress}
    Recipient: ${recipient}
    Amount: ${ethers.utils.formatUnits(amount, tokenDecimals)}
    Revert Options: ${JSON.stringify(revertOptions, null, 2)}
    Gas Fee: ${ethers.utils.formatUnits(gasFee, gasTokenDecimals)}`
  );

  try {
    // Encode recipient address to bytes
    const recipientBytes = ethers.utils.hexlify(
      ethers.utils.toUtf8Bytes(recipient)
    );

    // Call the withdraw function
    const tx = await zrc20Wrapper.withdraw(
      recipientBytes,
      amount,
      revertOptions,
      { gasLimit: args.onRevertGasLimit || 7000000 }
    );

    console.log(`Transaction sent. Hash: ${tx.hash}`);

    const receipt = await tx.wait();

    // Check events for withdrawal status
    const withdrawEvent = receipt.events?.find(
      (event: any) => event.event === "Withdrawn"
    );

    if (withdrawEvent) {
      console.log(`🚀 Withdrawal successful!
      Transaction Hash: ${tx.hash}
      Recipient: ${recipient}
      Amount: ${ethers.utils.formatUnits(amount, tokenDecimals)}`);
    } else {
      console.log(
        `Withdrawal may not have succeeded. Check transaction hash: ${tx.hash}`
      );
    }
  } catch (error: any) {
    if (error.message.includes("RateLimitExceeded")) {
      console.error("Rate limit exceeded. Try again later.");
    } else if (error.message.includes("insufficient funds")) {
      console.error(
        "Insufficient funds for gas. Ensure the wallet has enough native tokens for transaction fees."
      );
    } else {
      console.error("Withdrawal error:", error);
    }
  }
};

// Register the task for withdrawal
task("safeWithdraw", "Withdraw ZRC20 tokens with revert options", main)
  .addOptionalParam(
    "contract",
    "The address of the deployed ZRC20Wrapper contract"
  )
  .addOptionalParam("zrc20", "The address of ZRC20 to pay fees")
  .addOptionalParam(
    "to",
    "The recipient address, defaults to the signer address"
  )
  .addParam("amount", "The amount of tokens to withdraw")
  .addOptionalParam("revertAddress", "Address to receive revert")
  .addOptionalParam("abortAddress", "Address to receive funds if aborted")
  .addOptionalParam("revertMessage", "Message to send on revert")
  .addOptionalParam(
    "onRevertGasLimit",
    "Gas limit for revert transaction",
    7000000,
    types.int
  )
  .addFlag("callOnRevert", "Whether to call on revert")
  .addFlag("json", "Output the result in JSON format");
