// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

interface IRewardToken {
    function MINTER_ROLE() external view returns (bytes32);
    function hasRole(bytes32 role, address account) external view returns (bool);
    function mint(address to, uint256 amount) external;
    function pause() external;
    function unpause() external;
}
