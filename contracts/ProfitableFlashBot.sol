// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@balancer-labs/v2-interfaces/contracts/vault/IVault.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IFlashLoanRecipient.sol";

// =============================================================
// 1. INTERFACES
// =============================================================


interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

// Interface for SushiSwap / Camelot V2 Routers
interface IRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, address[] calldata path) 
        external view returns (uint256[] memory amounts);
}

interface IVault {
    function flashLoan(
        address recipient,
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
}

interface IFlashLoanRecipient {
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external;
}

// =============================================================
// 2. THE CONTRACT
// =============================================================

contract ArbProfitBot is IFlashLoanRecipient {
    
    address private immutable owner;
    
    // Balancer Vault (Same address on all chains)
    IVault private constant VAULT = IVault(0xBA12222222228d8Ba445958a75a0704d566BF2C8);
    
    // ARB Token (Arbitrum One Mainnet)
    address private constant ARB_TOKEN = 0x912CE59144191C1204E64559FE8253a0e49E6548;

    event TradeCompleted(uint256 profit, uint256 gasUsed, address token);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    struct TradeParams {
        address routerBuy;  // e.g. SushiSwap
        address routerSell; // e.g. Camelot
        address tokenB;     // USDC
        uint256 minProfit;  
    }

    // ============================================================
    // STEP 1: TRIGGER (Called by Node.js)
    // ============================================================
    function executeArbitrage(
        uint256 _borrowAmount,
        address _routerBuy,
        address _routerSell,
        address _tokenB,
        uint256 _minProfit
    ) external onlyOwner {
        
        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(ARB_TOKEN);
        
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = _borrowAmount;

        bytes memory userData = abi.encode(TradeParams({
            routerBuy: _routerBuy,
            routerSell: _routerSell,
            tokenB: _tokenB,
            minProfit: _minProfit
        }));

        // Initiate Flash Loan
        VAULT.flashLoan(address(this), tokens, amounts, userData);
    }

    // ============================================================
    // STEP 2: EXECUTION (Called by Balancer)
    // ============================================================
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override {
        require(msg.sender == address(VAULT), "Not Balancer Vault");
        
        uint256 startGas = gasleft();
        TradeParams memory params = abi.decode(userData, (TradeParams));
        
        uint256 amountBorrowed = amounts[0];
        uint256 fee = feeAmounts[0];
        uint256 totalDebt = amountBorrowed + fee;

        // --- TRADE 1: ARB -> USDC ---
        IERC20(ARB_TOKEN).approve(params.routerBuy, amountBorrowed);
        
        address[] memory pathA = new address[](2);
        pathA[0] = ARB_TOKEN;
        pathA[1] = params.tokenB;

        uint256[] memory resultsA = IRouter(params.routerBuy).swapExactTokensForTokens(
            amountBorrowed,
            0, 
            pathA,
            address(this),
            block.timestamp
        );
        uint256 amountUSDC = resultsA[1];

        // --- TRADE 2: USDC -> ARB ---
        IERC20(params.tokenB).approve(params.routerSell, amountUSDC);

        address[] memory pathB = new address[](2);
        pathB[0] = params.tokenB; // USDC
        pathB[1] = ARB_TOKEN;

        IRouter(params.routerSell).swapExactTokensForTokens(
            amountUSDC,
            0, 
            pathB,
            address(this),
            block.timestamp
        );

        // --- PROFIT CHECK ---
        uint256 finalBalance = IERC20(ARB_TOKEN).balanceOf(address(this));
        
        require(finalBalance >= totalDebt + params.minProfit, "Profit target not met");

        // --- PAYBACK ---
        IERC20(ARB_TOKEN).transfer(address(VAULT), totalDebt);

        uint256 profit = finalBalance - totalDebt;
        emit TradeCompleted(profit, startGas - gasleft(), ARB_TOKEN);
    }

    function withdrawProfit(address _token) external onlyOwner {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        require(balance > 0, "Empty");
        IERC20(_token).transfer(owner, balance);
    }
    
    receive() external payable {}
}