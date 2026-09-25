// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

interface IAuthorRegistry {
    function isAuthor(address account) external view returns (bool);
    function registerAuthor(address author, string calldata name) external;
    function removeAuthor(address author) external;
}
