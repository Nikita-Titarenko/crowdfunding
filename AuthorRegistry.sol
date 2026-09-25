// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IAuthorRegistry} from "./interfaces/IAuthorRegistry.sol";

contract AuthorRegistry is IAuthorRegistry, AccessControl {
    bytes32 public constant AUTHOR_MANAGER_ROLE = keccak256("AUTHOR_MANAGER_ROLE");

    struct Author {
        string name;
        bool isActive;
    }

    mapping(address => Author) private _authors;
    address[] private _authorList;

    error ZeroAddress();
    error EmptyName();
    error AlreadyRegistered();
    error NotRegistered();

    event AuthorRegistered(address indexed author, string name);
    event AuthorRemoved(address indexed author, string name);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(AUTHOR_MANAGER_ROLE, msg.sender);
    }

    /// @notice Adds a new author to the registry.
    /// @dev Only an authorized manager can perform this action.
    /// @param author The author address to register.
    /// @param name The display name of the author.
    function registerAuthor(address author, string calldata name)
        external
        override
        onlyRole(AUTHOR_MANAGER_ROLE)
    {
        if (author == address(0)) revert ZeroAddress();
        if (bytes(name).length == 0) revert EmptyName();
        if (_authors[author].isActive) revert AlreadyRegistered();

        _authors[author] = Author({name: name, isActive: true});
        _authorList.push(author);

        emit AuthorRegistered(author, name);
    }

    /// @notice Removes an author from the registry.
    /// @dev The author remains in the list of historical entries as an inactive record.
    /// @param author The author address to remove.
    function removeAuthor(address author) external override onlyRole(AUTHOR_MANAGER_ROLE) {
        if (author == address(0)) revert ZeroAddress();
        if (!_authors[author].isActive) revert NotRegistered();

        string memory name = _authors[author].name;
        delete _authors[author];

        emit AuthorRemoved(author, name);
    }

    /// @notice Returns whether an address is currently registered as an author.
    /// @param account The address to check.
    /// @return True if the address is active as an author.
    function isAuthor(address account) external view override returns (bool) {
        return _authors[account].isActive;
    }

    /// @notice Returns the metadata for an author.
    /// @param account The author address.
    /// @return name The author name.
    /// @return isActive Whether the author is active.
    function getAuthor(address account) external view returns (string memory name, bool isActive) {
        Author storage author = _authors[account];
        return (author.name, author.isActive);
    }

    /// @notice Returns all registered authors.
    /// @return An array of author addresses.
    function getAllAuthors() external view returns (address[] memory) {
        return _authorList;
    }
}
