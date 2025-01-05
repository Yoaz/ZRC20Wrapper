# ZRC20Wrapper Smart Contract

## Overview

The `ZRC20Wrapper` smart contract facilitates the secure withdrawal of ZRC20 tokens from ZetaChain to associated connected chains (e.g., Ethereum, Binance Smart Chain). Each native gas token or supported ERC20 token has a corresponding ZRC20 token, and this contract ensures withdrawals occur with built-in safety mechanisms.

Key features include a **rate-limiting mechanism** to cap withdrawal volumes over a predefined time window and a **cooldown period** to prevent excessive withdrawals and mitigate reentrancy attacks. It integrates directly with ZetaChain Gateway for cross-chain operations.

##### NOTE: The current mechanism relies on `block.timestamp`, which may not be the most efficient or secure method for handling time-based boundaries. As such, this is intended as a conceptual overview rather than a production-ready solution. In a production environment, alternative approaches that offer better reliability and security could be implemented, including:

- **Block Number-Based Mechanism**: Use `block.number` to measure intervals by counting blocks instead of relying on timestamps, ensuring greater consistency across the network.

- **Combination of Block Number and Timestamp**: Combine `block.number` with `block.timestamp` to provide a more reliable and tamper-resistant time boundary.

- **Oracles (e.g., Chainlink Automation)**: Leverage oracle services like Chainlink Automation to create a decentralized worker that monitors and enforces time intervals, regularly resetting the window or triggering updates as required.

- **Dynamic Adjustment**: Use off-chain monitoring systems to adjust time intervals or reset limits dynamically based on network activity and feed the updates securely on-chain.

---

## Key Features

- **Rate Limiting**: Restricts withdrawal volumes within a specified time window.
- **Cooldown Period**: Enforces a time gap between successive withdrawals globally.
- **Cross-Chain Compatibility**: Uses ZetaChain Gateway for withdrawals to connected chains.
- **Revert Handling**: Handles and logs revert contexts for failed transactions.
- **Owner Configurable**: The contract owner can update withdrawal parameters.
- **Gas Fee Management**: Automatically calculates and includes gas fees during withdrawals.

---

## Contract Components

### State Variables

- **`zrc20Token`**: Reference to the ZRC20 token.
- **`gateway`**: Reference to the ZetaChain Gateway.
- **`maxWithdrawalAmount`**: Maximum allowed withdrawal amount per time window.
- **`timeWindow`**: Duration (in seconds) of the rate-limiting time window.
- **`cooldownPeriod`**: Interval (in seconds) between global withdrawals.
- **`totalWithdrawn`**: Tracks total withdrawals in the current time window.
- **`lastReset`**: Timestamp of the last time window reset.
- **`lastGlobalWithdrawal`**: Timestamp of the last global withdrawal.

### Events

- **`Withdrawn`**: Logs successful withdrawals.
- **`RateLimitExceeded`**: Logs when a withdrawal exceeds the rate limit.
- **`ConfigUpdated`**: Logs updates to withdrawal parameters.
- **`RevertEvent`**: Logs details of reverted transactions.
- **`HelloEvent`**: Example event triggered by the `onCall` function.

### Modifiers

- **`enforceRateLimit`**: Ensures withdrawal amounts stay within allowed limits.
- **`enforceCooldown`**: Enforces cooldown periods between withdrawals.
- **`onlyGateway`**: Restricts access to the ZetaChain Gateway.

### Core Functions

1. **`updateConfig`**

   - Updates the withdrawal parameters: `maxWithdrawalAmount`, `timeWindow`, `cooldownPeriod`.
   - Restricted to the contract owner.

2. **`withdraw`**

   - Initiates a secure withdrawal while enforcing rate-limiting and cooldown rules.

3. **`onRevert`**

   - Handles reverted transactions and logs the context.

4. **`onCall`**

   - Processes cross-chain calls and demonstrates event logging.

### View Functions

1. **`getRemainingAllowance`**

   - Returns the remaining withdrawal allowance for the current time window.

2. **`getRemainingCooldownTime`**

   - Checks the time remaining before the next allowed withdrawal.

3. **`getRemainingTimeWindow`**

   - Retrieves the time left in the current rate-limiting window.

4. **`getLastTimeReset`**

   - Returns the timestamp of the last time window reset.

---

## Associated Tasks

### 1. Deploy Task

Automates the deployment of the contract. Parameters are fetched from `.env` or provided via CLI.

#### Example `.env` File:

```env
GATEWAY_ADDRESS=<gateway-address>
ZRC20_TOKEN_ADDRESS=<zrc20-token-address>
MAX_WITHDRAWAL_AMOUNT=<max-amount>
TIME_WINDOW=<time-window>
COOLDOWN_PERIOD=<cooldown-period>
```

#### Command:

```bash
npx hardhat deploy --network <network>
```

---

### 2. Safe Withdraw Task

Executes the `withdraw` function with safety checks in place.

#### Required CLI Parameter:

- `--amount`: Amount of tokens to withdraw.

#### Example Command:

```bash
npx hardhat safeWithdraw --amount 100 --network <network>
```

---

### 3. Utility Tasks

- **`getRemainingAllowance`**: Retrieves the remaining withdrawal allowance.
- **`getRemainingCooldownTime`**: Checks the status of the cooldown period.
- **`getRemainingTimeWindow`**: Retrieves the time left in the current rate-limiting window.

---

## Deployment Example

```bash
npx hardhat deploy --network <network>
```

---

## Withdrawal Example

```bash
npx hardhat safeWithdraw --amount 100 --network <network>
```

---

## Security Notes

- **Rate Limiting**: Ensures withdrawals do not exceed predefined limits within a time window.
- **Cooldown Period**: Adds a delay between successive withdrawals to mitigate potential abuse.
- **Gas Fee Management**: Ensures adequate gas fees are included in withdrawals.
- **Reentrancy Protection**: Uses OpenZeppelin's `ReentrancyGuard` to secure the contract.

---

## License

This project is licensed under the MIT License.
