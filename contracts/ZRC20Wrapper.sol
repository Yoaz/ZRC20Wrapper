// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IZRC20} from "./interfaces/IZRC20.sol";
import {RevertContext, RevertOptions} from "@zetachain/protocol-contracts/contracts/Revert.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/UniversalContract.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IGatewayZEVM.sol";

contract ZRC20Wrapper is ReentrancyGuard, Ownable, UniversalContract {
    // =============================================================
    // State Variables
    // =============================================================

    /// @notice Reference to the ZRC-20 token
    IZRC20 public immutable zrc20Token;

    /// @notice ZetaChain Gateway for cross-chain operations
    IGatewayZEVM public immutable gateway;

    /// @notice Maximum withdrawal amount per time window
    uint256 public maxWithdrawalAmount;

    /// @notice Time window in seconds for rate-limiting withdrawals
    uint256 public timeWindow;

    /// @notice Cooldown period (in seconds) between successive withdrawals globally
    uint256 public cooldownPeriod;

    /// @notice Total withdrawn amount in the current time window
    uint256 public totalWithdrawn;

    /// @notice Timestamp of the last reset of the time window
    uint256 public lastReset;

    /// @notice Timestamp of the last global withdrawal
    uint256 public lastGlobalWithdrawal;

    // =============================================================
    // Events
    // =============================================================

    /// @notice Emitted on successful withdrawal
    event Withdrawn(address indexed user, uint256 amount);

    /// @notice Emitted when withdrawal exceeds the rate limit
    event RateLimitExceeded(address indexed user, uint256 amount);

    /// @notice Emitted when rate-limiting or cooldown configuration is updated
    event ConfigUpdated(
        uint256 maxAmount,
        uint256 timeWindow,
        uint256 cooldown
    );

    /// @notice Emitted when a transaction is reverted
    event RevertEvent(string message, RevertContext context);

    /// @notice Example event for onCall function
    event HelloEvent(string name, string greeting);

    // =============================================================
    // Errors
    // =============================================================

    error Unauthorized(); // Thrown when an unauthorized action is attempted
    error InvalidRecipientAddress(); // Thrown when the recipient address is invalid
    error InvalidAmount(); // Thrown when the withdrawal amount is zero
    error RateLimitExceededError(uint256 remainingAllowance); // Thrown when a withdrawal exceeds the rate limit
    error TokenTransferFailed(); // Thrown when token transfer fails
    error CooldownNotElapsed(uint256 timeRemaining); // Thrown when a withdrawal is attempted before cooldown ends
    error UnsafeTimeWindow(); // From etheruem documentation: "If the scale of your time-dependent event can vary by 15 seconds and maintain integrity, it is safe to use a block.timestamp."

    // =============================================================
    // Constructor
    // =============================================================

    /**
     * @notice Initializes the contract with required parameters.
     * @param _gateway Address of the ZetaChain Gateway.
     * @param _zrc20Token Address of the ZRC-20 token contract.
     * @param _maxWithdrawalAmount Maximum withdrawal amount per time window.
     * @param _timeWindow Duration of the time window (in seconds) for rate-limiting.
     * @param _cooldownPeriod Global cooldown period (in seconds) between withdrawals.
     */
    constructor(
        address payable _gateway,
        IZRC20 _zrc20Token,
        uint256 _maxWithdrawalAmount,
        uint256 _timeWindow,
        uint256 _cooldownPeriod
    ) Ownable(msg.sender) {
        if (address(_zrc20Token) == address(0))
            revert InvalidRecipientAddress();
        if (_gateway == address(0)) revert InvalidRecipientAddress();
        if (_timeWindow < 15) revert UnsafeTimeWindow(); // Using block.timestamp is "safe" for greater 15seconds time intervals

        lastReset = block.timestamp; // Initate lastReset upon contract deployment
        gateway = IGatewayZEVM(_gateway);
        zrc20Token = _zrc20Token;
        maxWithdrawalAmount = _maxWithdrawalAmount;
        timeWindow = _timeWindow;
        cooldownPeriod = _cooldownPeriod;
    }

    // =============================================================
    // Modifiers
    // =============================================================

    /**
     * @dev Enforces rate-limiting for withdrawals.
     * Resets the totalWithdrawn counter if the time window has elapsed.
     * Reverts if the withdrawal amount exceeds the remaining allowance.
     * @param amount The amount of tokens to withdraw.
     */
    modifier enforceRateLimit(uint256 amount) {
        if (block.timestamp > lastReset + timeWindow) {
            lastReset = block.timestamp; // Reset the tracking variables
            totalWithdrawn = 0;
        }
        if (totalWithdrawn + amount > maxWithdrawalAmount) {
            revert RateLimitExceededError(maxWithdrawalAmount - totalWithdrawn);
        }
        _;
    }

    /**
     * @dev Enforces a cooldown period between global withdrawals.
     * Reverts if the cooldown period has not elapsed.
     */
    modifier enforceCooldown() {
        if (block.timestamp < lastGlobalWithdrawal + cooldownPeriod) {
            revert CooldownNotElapsed(
                lastGlobalWithdrawal + cooldownPeriod - block.timestamp
            );
        }
        _;
    }

    /**
     * @dev Restricts access to only the ZetaChain Gateway.
     */
    modifier onlyGateway() {
        if (msg.sender != address(gateway)) revert Unauthorized();
        _;
    }

    // =============================================================
    // Core Functions
    // =============================================================

    /**
     * @notice Updates the rate-limiting and cooldown configuration.
     * @param _maxWithdrawalAmount New maximum withdrawal amount per time window.
     * @param _timeWindow New time window duration (in seconds).
     * @param _cooldownPeriod New cooldown period (in seconds) between withdrawals.
     */
    function updateConfig(
        uint256 _maxWithdrawalAmount,
        uint256 _timeWindow,
        uint256 _cooldownPeriod
    ) external onlyOwner {
        maxWithdrawalAmount = _maxWithdrawalAmount;
        timeWindow = _timeWindow;
        cooldownPeriod = _cooldownPeriod;
        emit ConfigUpdated(_maxWithdrawalAmount, _timeWindow, _cooldownPeriod);
    }

    /**
     * @notice Allows users to withdraw tokens within the allowed rate limits and cooldown period.
     * @param to The recipient address in bytes format.
     * @param amount The amount of tokens to withdraw.
     * @param revertOptions Options for handling reverts.
     */
    function withdraw(
        bytes memory to,
        uint256 amount,
        RevertOptions memory revertOptions
    ) external nonReentrant enforceRateLimit(amount) enforceCooldown {
        if (to.length == 0) revert InvalidRecipientAddress();
        if (amount == 0) revert InvalidAmount();

        totalWithdrawn += amount; // Track the amount withdrawn
        lastGlobalWithdrawal = block.timestamp; // Update global withdrawal timestamp

        // Fetch gas fee details
        (address gasZRC20, uint256 gasFee) = zrc20Token.withdrawGasFee();
        uint256 targetAmount = (address(zrc20Token) == gasZRC20)
            ? amount + gasFee
            : amount;

        // Transfer tokens from the user and approve the gateway
        if (!zrc20Token.transferFrom(msg.sender, address(this), targetAmount)) {
            revert TokenTransferFailed();
        }
        zrc20Token.approve(address(gateway), targetAmount);

        // Handle additional gas token if different from the withdrawal token
        if (address(zrc20Token) != gasZRC20) {
            IZRC20 gasToken = IZRC20(gasZRC20);
            if (!gasToken.transferFrom(msg.sender, address(this), gasFee)) {
                revert TokenTransferFailed();
            }
            gasToken.approve(address(gateway), gasFee);
        }

        // Initiate withdrawal via the Gateway
        gateway.withdraw(to, amount, address(zrc20Token), revertOptions);

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Handles reverted transactions from the ZetaChain Gateway.
     * @param revertContext The context of the reverted transaction.
     */
    function onRevert(RevertContext calldata revertContext) external {
        if (msg.sender != address(gateway)) revert Unauthorized();
        emit RevertEvent("Transaction reverted", revertContext);
    }

    /**
     * @notice Processes incoming cross-chain calls through the Gateway.
     * @param context The context of the message.
     * @param zrc20 The address of the ZRC-20 token used in the transaction.
     * @param amount The amount of tokens transferred.
     * @param message Encoded message payload.
     */
    function onCall(
        MessageContext calldata context,
        address zrc20,
        uint256 amount,
        bytes calldata message
    ) external override onlyGateway {
        string memory name = abi.decode(message, (string));
        emit HelloEvent("Hello: ", name);
    }

    // =============================================================
    // View Functions
    // =============================================================

    /**
     * @notice Retrieves the remaining withdrawal allowance for the current time window.
     * Dynamically calculates the allowance based on the elapsed time since the last reset.
     * If the time window has elapsed, it returns the full maximum withdrawal allowance.
     */
    function getRemainingAllowance() public view returns (uint256) {
        uint256 elapsedTime = block.timestamp > lastReset
            ? block.timestamp - lastReset
            : 0;
        if (elapsedTime > timeWindow) {
            // If time window has elapsed, reset the allowance
            return maxWithdrawalAmount;
        }
        return maxWithdrawalAmount - totalWithdrawn;
    }

    /**
     * @notice Retrieves the remaining cooldown time before the next withdrawal is allowed.
     * Dynamically calculates the remaining cooldown period based on the last global withdrawal timestamp.
     * Returns 0 if the cooldown period has already elapsed.
     */
    function getRemainingCooldownTime() public view returns (uint256) {
        if (block.timestamp >= lastGlobalWithdrawal + cooldownPeriod) {
            return 0;
        }
        return lastGlobalWithdrawal + cooldownPeriod - block.timestamp;
    }

    /**
     * @notice Retrieves the remaining seconds in the current time window.
     * Dynamically calculates the time remaining until the time window ends.
     * If the time window has elapsed, it returns the full duration of the time window as a logical reset.
     */
    function getRemainingTimeWindow() public view returns (uint256) {
        uint256 elapsedTime = block.timestamp > lastReset
            ? block.timestamp - lastReset
            : 0;
        if (elapsedTime >= timeWindow) {
            // Time window has elapsed, reset logically
            return timeWindow;
        }
        return timeWindow - elapsedTime;
    }

    /**
     * @notice Retreieve the last time reset
     */
    function getLastTimeReset() public view returns (uint256) {
        return lastReset;
    }
}
