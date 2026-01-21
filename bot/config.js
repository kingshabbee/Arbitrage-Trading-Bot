module.exports = {
    // 1. YOUR CONTRACT ADDRESS (Keep your existing one)
    BOT_CONTRACT_ADDRESS: "0x80F440170feCd23D18DD78687fD2F121f5aA7EDD", 

    // 2. TOKENS 
    // WETH 
    FLASH_TOKEN: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", 
    
    // BRIDGED USDC (Liquidity exists on Camelot V2)
    USDC_TOKEN: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", 

    // 3. ROUTERS (THE TRICK)
    // We put the CAMELOT address in BOTH slots to verify the code runs.
    SUSHI_ROUTER:   "0xc873fecbd354f5a56e00e710b90ef4201db2448d", // <--- Using Camelot address here
    CAMELOT_ROUTER: "0xc873fecbd354f5a56e00e710b90ef4201db2448d",

    // 4. SETTINGS
    BORROW_AMOUNT: "0.1", 
    MIN_PROFIT_USD: 0.0001,       
    GAS_LIMIT: 2000000        
};