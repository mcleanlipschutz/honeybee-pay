// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Learning prototype: records public payment approvals.
contract HoneybeePay {
    struct PaymentApproval {
        address recipient;
        address token;
        uint256 amount;
        uint256 expiresAt;
        bool used;
    }

    // Each buyer has their own numbered approvals.
    mapping(address => uint256) public nextNonce;

    mapping(address => mapping(uint256 => PaymentApproval))
        public approvals;

    event PaymentApproved(
        address indexed buyer,
        uint256 indexed nonce,
        address indexed recipient,
        address token,
        uint256 amount,
        uint256 expiresAt
    );

    function approvePayment(
        address recipient,
        address token,
        uint256 amount,
        uint256 expiresAt
    ) external returns (uint256 nonce) {
        require(recipient != address(0), "Invalid recipient");
        require(token != address(0), "Invalid token");
        require(token.code.length > 0, "Token must be a contract");
        require(amount > 0, "Amount must be positive");
        require(expiresAt > block.timestamp, "Expiry must be future");

        // The caller can only create approvals for their own wallet.
        nonce = nextNonce[msg.sender];
        nextNonce[msg.sender] = nonce + 1;

        approvals[msg.sender][nonce] = PaymentApproval({
            recipient: recipient,
            token: token,
            amount: amount,
            expiresAt: expiresAt,
            used: false
        });

        emit PaymentApproved(
            msg.sender,
            nonce,
            recipient,
            token,
            amount,
            expiresAt
        );
    }
}
