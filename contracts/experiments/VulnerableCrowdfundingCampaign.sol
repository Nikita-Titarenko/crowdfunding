// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

contract VulnerableCrowdfundingCampaign {
    address public immutable beneficiary;

    error TransferFailed();

    constructor(address _beneficiary) {
        beneficiary = _beneficiary;
    }

    receive() external payable {}

    /// @notice Vulnerable copy of the campaign withdrawal logic.
    /// @dev Deliberately missing the authorization check, so any caller can drain funds.
    function withdrawFunds() external {
        uint256 balance = address(this).balance;
        if (balance == 0) revert TransferFailed();

        (bool success,) = payable(msg.sender).call{value: balance}("");
        if (!success) revert TransferFailed();
    }
}
