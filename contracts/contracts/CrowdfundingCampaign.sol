// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAuthorRegistry} from "../interfaces/IAuthorRegistry.sol";
import {IPriceFeed} from "../interfaces/IPriceFeed.sol";
import {IRewardToken} from "../interfaces/IRewardToken.sol";

contract CrowdfundingCampaign is ReentrancyGuard {
    uint256 public constant REWARD_MULTIPLIER = 10;
    uint256 private constant USD_SCALE = 1e18;

    IAuthorRegistry public immutable authorRegistry;
    IPriceFeed public immutable priceFeed;
    IRewardToken public immutable rewardToken;

    address public immutable author;
    address public immutable beneficiary;
    string public metadataCid;
    uint256 public immutable goalUsd;
    uint256 public immutable deadline;
    uint256 public totalRaised;
    bool public finalized;

    mapping(address => uint256) public contributions;
    mapping(address => bool) public rewardClaimed;
    mapping(address => bool) public refundClaimed;

    error ZeroAddress();
    error NotAuthor();
    error InvalidGoal();
    error InvalidOraclePrice();
    error InvalidPriceFeedDecimals();
    error StaleOraclePrice();
    error CampaignClosed();
    error CampaignStillOpen();
    error GoalNotReached();
    error GoalReached();
    error InvalidAmount();
    error NoContribution();
    error AlreadyClaimed();
    error AlreadyRefunded();
    error MissingMinterRole();
    error TransferFailed();
    error Unauthorized();

    event CampaignCreated(
        address indexed authorAddress,
        address indexed registry,
        address indexed token,
        address priceFeed,
        string metadataCid,
        uint256 goalUsd,
        uint256 deadline
    );
    event ContributionReceived(address indexed supporter, uint256 amount);
    event BeneficiaryWithdrawn(address indexed beneficiary, uint256 amount);
    event RefundIssued(address indexed supporter, uint256 amount);
    event RewardClaimed(address indexed supporter, uint256 amount);

    constructor(
        address registry,
        address token,
        address ethUsdPriceFeed,
        string memory campaignMetadataCid,
        uint256 campaignGoalUsd,
        uint256 duration,
        address campaignBeneficiary
    ) {
        if (
            registry == address(0) || token == address(0) || ethUsdPriceFeed == address(0) || campaignBeneficiary == address(0)
        ) {
            revert ZeroAddress();
        }
        if (campaignGoalUsd == 0) revert InvalidGoal();
        if (!IAuthorRegistry(registry).isAuthor(msg.sender)) revert NotAuthor();

        uint8 feedDecimals = IPriceFeed(ethUsdPriceFeed).decimals();
        if (feedDecimals > 18) revert InvalidPriceFeedDecimals();

        authorRegistry = IAuthorRegistry(registry);
        priceFeed = IPriceFeed(ethUsdPriceFeed);
        rewardToken = IRewardToken(token);
        author = msg.sender;
        beneficiary = campaignBeneficiary;
        metadataCid = campaignMetadataCid;
        goalUsd = campaignGoalUsd;
        deadline = block.timestamp + duration;

        emit CampaignCreated(msg.sender, registry, token, ethUsdPriceFeed, campaignMetadataCid, campaignGoalUsd, deadline);
    }

    /// @notice Contributes ETH to the campaign before the deadline.
    /// @dev Each contribution increases the total collected amount and tracks the investor balance.
    function contribute() external payable {
        if (block.timestamp >= deadline) revert CampaignClosed();
        if (msg.value == 0) revert InvalidAmount();

        contributions[msg.sender] += msg.value;
        totalRaised += msg.value;

        emit ContributionReceived(msg.sender, msg.value);
    }

    /// @notice Allows the beneficiary to withdraw funds after the deadline when the goal is reached.
    /// @dev The campaign cannot withdraw before deadline or if the target is not met.
    function withdrawFunds() external {
        if (msg.sender != beneficiary) revert Unauthorized();
        if (block.timestamp < deadline) revert CampaignStillOpen();
        if (!_hasReachedGoal()) revert GoalNotReached();
        if (finalized) revert CampaignClosed();

        finalized = true;
        uint256 balance = address(this).balance;

        (bool success,) = payable(beneficiary).call{value: balance}("");
        if (!success) revert TransferFailed();

        emit BeneficiaryWithdrawn(beneficiary, balance);
    }

    /// @notice Claims a refund when the campaign ends without reaching its goal.
    /// @dev Refund can be claimed only once per contributor.
    function claimRefund() external {
        if (block.timestamp < deadline) revert CampaignStillOpen();
        if (_hasReachedGoal()) revert GoalReached();
        if (refundClaimed[msg.sender]) revert AlreadyRefunded();

        uint256 amount = contributions[msg.sender];
        if (amount == 0) revert NoContribution();

        refundClaimed[msg.sender] = true;
        contributions[msg.sender] = 0;

        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();

        emit RefundIssued(msg.sender, amount);
    }

    /// @notice Claims the reward token for a successful campaign.
    /// @dev Rewards are distributed proportionally to the supporter contribution.
    function claimReward() external {
        if (block.timestamp < deadline) revert CampaignStillOpen();
        if (!_hasReachedGoal()) revert GoalNotReached();
        if (rewardClaimed[msg.sender]) revert AlreadyClaimed();

        uint256 contribution = contributions[msg.sender];
        if (contribution == 0) revert NoContribution();
        if (!rewardToken.hasRole(rewardToken.MINTER_ROLE(), address(this))) revert MissingMinterRole();

        rewardClaimed[msg.sender] = true;

        uint256 rewardAmount = (contribution * REWARD_MULTIPLIER * 1e18) / 1 ether;
        if (rewardAmount == 0) rewardAmount = 1;

        rewardToken.mint(msg.sender, rewardAmount);

        emit RewardClaimed(msg.sender, rewardAmount);
    }

    /// @notice Returns the current campaign status.
    /// @return success True if the target was reached before the deadline.
    function isSuccessful() external view returns (bool success) {
        return block.timestamp >= deadline && _hasReachedGoal();
    }

    function currentEthUsdPrice() public view returns (uint256) {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = priceFeed.latestRoundData();
        if (answer <= 0) revert InvalidOraclePrice();
        if (updatedAt == 0 || answeredInRound < roundId) revert StaleOraclePrice();

        uint8 feedDecimals = priceFeed.decimals();
        return uint256(answer) * (USD_SCALE / (10 ** feedDecimals));
    }

    function totalRaisedUsd() public view returns (uint256) {
        return _convertEthToUsd(totalRaised);
    }

    function contributionUsd(address supporter) external view returns (uint256) {
        return _convertEthToUsd(contributions[supporter]);
    }

    function _hasReachedGoal() internal view returns (bool) {
        return totalRaisedUsd() >= goalUsd;
    }

    function _convertEthToUsd(uint256 amountWei) internal view returns (uint256) {
        return amountWei * currentEthUsdPrice() / 1 ether;
    }
}
