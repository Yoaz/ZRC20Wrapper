import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import ZRC20ABI from "@zetachain/protocol-contracts/abi/ZRC20.sol/ZRC20.json";
import * as dotenv from "dotenv";

dotenv.config();

// Verify contract on related block explorer
const verifyContract = async (
  hre: HardhatRuntimeEnvironment,
  contractAddress: string,
  constructorArgs: any[]
) => {
  console.log("\nVerification process in progress...");
  try {
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: constructorArgs,
    });
    console.log("Verification completed. ✅");
  } catch (e: any) {
    if (e.message.toLowerCase().includes("already verified")) {
      console.log("Already verified!");
    } else {
      console.error("Verification error:", e.message);
    }
  }
};

const main = async (args: any, hre: HardhatRuntimeEnvironment) => {
  const networkName = hre.network.name;
  const { ethers } = hre;

  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error(
      `Wallet not found. Please, run "npx hardhat account --save" or set the PRIVATE_KEY env variable in a .env file.`
    );
  }

  // Contract and network details
  const contractName = args.name || "ZRC20Wrapper";

  // Load constructor arguments from environment variables
  const gatewayAddress = args.gateway || process.env.GATEWAY_ADDRESS;
  const zrc20Address = args.zrc20 || process.env.ZRC20_ETH_ADDRESS;
  const rawMaxWithdrawalAmount =
    args.maxWithdrawal || process.env.MAX_WITHDRAWAL_AMOUNT;
  const timeWindow = args.timeWindow || process.env.TIME_WINDOW;
  const cooldownTime = args.cooldownTime || process.env.COOLDOWN_TIME;

  if (
    !gatewayAddress ||
    !zrc20Address ||
    !rawMaxWithdrawalAmount ||
    !timeWindow ||
    !cooldownTime
  ) {
    throw new Error(
      "Missing required environment variables or task parameters."
    );
  }

  // Fetch token decimals for proper unit conversion
  console.log("Fetching token decimals...");
  const zrc20 = new ethers.Contract(zrc20Address, ZRC20ABI.abi, signer);
  const tokenDecimals = await zrc20.decimals();

  // Properly format max withdrawal amount
  const maxWithdrawalAmount = ethers.utils.parseUnits(
    rawMaxWithdrawalAmount.toString(),
    tokenDecimals
  );

  const constructorArgs = [
    gatewayAddress,
    zrc20Address,
    maxWithdrawalAmount,
    parseInt(timeWindow, 10),
    parseInt(cooldownTime, 10),
  ];

  console.log(`Deploying ${contractName} on ${networkName}...`);
  console.log("Constructor arguments:", constructorArgs);

  try {
    // Deploy the contract
    const ContractFactory: any = await ethers.getContractFactory(contractName);
    const deployedContract = await ContractFactory.deploy(...constructorArgs);
    await deployedContract.deployed();

    const contractAddress = deployedContract.address;

    console.log(`🚀 Successfully deployed "${contractName}" on ${networkName}.
📜 Contract address: ${contractAddress}
🔗 Transaction hash: ${deployedContract.deployTransaction.hash}`);

    // Verify the contract if not on localnet
    if (networkName !== "localnet") {
      console.log("Verifying contract on block explorer...");
      await verifyContract(hre, contractAddress, constructorArgs);
    } else {
      console.log("Skipping verification on localnet.");
    }

    if (args.json) {
      console.log(
        JSON.stringify({
          contractAddress,
          deployer: signer.address,
          network: networkName,
          transactionHash: deployedContract.deployTransaction.hash,
        })
      );
    }
  } catch (error: any) {
    console.error("Deployment error:", error.message);
    process.exit(1);
  }
};

// Register the deploy task
task("deploy", "Deploy the ZRC20Wrapper contract")
  .addOptionalParam("name", "The contract name to deploy", "ZRC20Wrapper")
  .addOptionalParam("gateway", "The ZetaChain Gateway address")
  .addOptionalParam("zrc20", "The ZRC20 token address")
  .addOptionalParam(
    "maxWithdrawal",
    "The max withdrawal amount",
    undefined,
    types.string // Use string to allow precise unit handling
  )
  .addOptionalParam(
    "timeWindow",
    "The time window for withdrawal",
    undefined,
    types.int
  )
  .addOptionalParam(
    "cooldownTime",
    "The cooldown time window between withdrawal",
    undefined,
    types.int
  )
  .addFlag("json", "Output the result in JSON format")
  .setAction(main);
