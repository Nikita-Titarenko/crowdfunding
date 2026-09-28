// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

contract MockPriceFeed {
    uint8 public immutable decimals;

    int256 private currentAnswer;
    uint80 private currentRoundId;
    uint256 private currentUpdatedAt;

    constructor(uint8 feedDecimals, int256 initialAnswer) {
        decimals = feedDecimals;
        currentAnswer = initialAnswer;
        currentRoundId = 1;
        currentUpdatedAt = block.timestamp;
    }

    function updateAnswer(int256 nextAnswer) external {
        currentAnswer = nextAnswer;
        currentRoundId += 1;
        currentUpdatedAt = block.timestamp;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (currentRoundId, currentAnswer, currentUpdatedAt, currentUpdatedAt, currentRoundId);
    }
}