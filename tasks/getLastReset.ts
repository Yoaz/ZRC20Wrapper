import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import ZRC20WrapperABI from "../artifacts/contracts/ZRC20Wrapper.sol/ZRC20Wrapper.json";
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

  console.log("Fetching last reset time...");

  // Use contract address from CLI args or .env
  const wrapperAddress = args.contract || process.env.ZRC20WRAPPER_ADDRESS;
  if (!wrapperAddress) {
    throw new Error(
      "ZRC20Wrapper address not found. Ensure it is set in the .env file or passed as an argument."
    );
  }

  // Retrieve the contract instance
  const zrc20Wrapper = new ethers.Contract(
    wrapperAddress,
    ZRC20WrapperABI.abi,
    signer
  );

  try {
    // Call the getLastReset function
    const lastResetTime = await zrc20Wrapper.getLastTimeReset();

    // Output result
    if (args.json) {
      console.log(
        JSON.stringify({
          lastResetTime: lastResetTime.toString(),
        })
      );
    } else {
      console.log(`Last Reset Time: ${lastResetTime.toString()}`);
    }
  } catch (error: any) {
    console.error("Error fetching last reset time:", error.message);
  }
};

// Register the task for fetching last reset time
task("getLastReset", "Fetch the last reset time from ZRC20Wrapper")
  .addOptionalParam(
    "contract",
    "The address of the deployed ZRC20Wrapper contract"
  )
  .addFlag("json", "Output the result in JSON format")
  .setAction(main);
