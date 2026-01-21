// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

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

contract ArbProfitBot is IFlashLoanRecipient {
    address private immutable owner;
    IVault private constant VAULT = IVault(0xBA12222222228d8Ba445958a75a0704d566BF2C8);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    struct TradeParams {
        address flashToken; // The token we borrowed (e.g., WETH)
        address routerBuy;
        address routerSell;
        address tokenB;     // The bridge token (e.g., USDC)
        uint256 minProfit;
    }

    function executeArbitrage(
        address _flashToken,  // <--- NEW: You choose the token here
        uint256 _borrowAmount,
        address _routerBuy,
        address _routerSell,
        address _tokenB,
        uint256 _minProfit
    ) external onlyOwner {
        
        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(_flashToken);
        
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = _borrowAmount;

        bytes memory userData = abi.encode(TradeParams({
            flashToken: _flashToken,
            routerBuy: _routerBuy,
            routerSell: _routerSell,
            tokenB: _tokenB,
            minProfit: _minProfit
        }));

        VAULT.flashLoan(address(this), tokens, amounts, userData);
    }

    function receiveFlashLoan(
        IERC20[] memory /* tokens */,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override {
        require(msg.sender == address(VAULT), "Not Balancer");
        
        TradeParams memory params = abi.decode(userData, (TradeParams));
        uint256 amountBorrowed = amounts[0];
        uint256 totalDebt = amountBorrowed + feeAmounts[0];

        // Trade 1: FlashToken -> TokenB
        IERC20(params.flashToken).approve(params.routerBuy, amountBorrowed);
        
        address[] memory pathA = new address[](2);
        pathA[0] = params.flashToken;
        pathA[1] = params.tokenB;

        uint256[] memory resultsA = IRouter(params.routerBuy).swapExactTokensForTokens(
            amountBorrowed, 0, pathA, address(this), block.timestamp
        );

        // Trade 2: TokenB -> FlashToken
        uint256 amountReceived = resultsA[1];
        IERC20(params.tokenB).approve(params.routerSell, amountReceived);

        address[] memory pathB = new address[](2);
        pathB[0] = params.tokenB;
        pathB[1] = params.flashToken;

        IRouter(params.routerSell).swapExactTokensForTokens(
            amountReceived, 0, pathB, address(this), block.timestamp
        );

        // Payback
        uint256 finalBalance = IERC20(params.flashToken).balanceOf(address(this));
        require(finalBalance >= totalDebt + params.minProfit, "No Profit");

        IERC20(params.flashToken).transfer(address(VAULT), totalDebt);
    }

    function withdraw(address _token) external onlyOwner {
        IERC20(_token).transfer(owner, IERC20(_token).balanceOf(address(this)));
    }
    
    receive() external payable {}
}