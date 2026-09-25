// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SecureCrowdfundingCampaign is ReentrancyGuard {
    address public immutable beneficiary;

    error Unauthorized();
    error TransferFailed();

    constructor(address _beneficiary) {
        beneficiary = _beneficiary;
    }

    receive() external payable {}

    /// @notice Proper withdrawal logic with authorization and reentrancy protection.
    function withdrawFunds() external nonReentrant {
        if (msg.sender != beneficiary) revert Unauthorized();

        uint256 balance = address(this).balance;
        if (balance == 0) revert TransferFailed();

        (bool success,) = payable(beneficiary).call{value: balance}("");
        if (!success) revert TransferFailed();
    }
}
