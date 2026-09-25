// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

interface IRewardToken {
    function mint(address to, uint256 amount) external;
    function pause() external;
    function unpause() external;
}
