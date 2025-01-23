class TradeDto {
  constructor(sg) {
    this.tradeType = sg.tradeType;
    this.well = sg.well;
    this.account = sg.account?.id;
    if (this.tradeType !== 'SWAP') {
      this.lpTokenAmount = sg.liqLpTokenAmount && BigInt(sg.liqLpTokenAmount);
      this.reservesAmount = sg.reservesAmount?.map(BigInt);
    } else {
      this.fromToken = sg.swapFromToken;
      this.amountIn = sg.swapAmountIn && BigInt(sg.swapAmountIn);
      this.toToken = sg.swapToToken;
      this.amountOut = sg.swapAmountOut && BigInt(sg.swapAmountOut);
    }
    this.isConvert = sg.isConvert;
    this.beforeReserves = sg.beforeReserves?.map(BigInt);
    this.afterReserves = sg.afterReserves?.map(BigInt);
    this.beforeTokenRates = sg.beforeTokenRates?.map((r) => parseFloat(r));
    this.afterTokenRates = sg.afterTokenRates?.map((r) => parseFloat(r));
    this.tradeVolumeReserves = sg.tradeVolumeReserves?.map(BigInt);
    this.tradeVolumeReservesUSD = sg.tradeVolumeReservesUSD?.map((r) => parseFloat(r));
    this.tradeVolumeUSD = sg.tradeVolumeUSD && parseFloat(sg.tradeVolumeUSD);
    this.biTradeVolumeReserves = sg.biTradeVolumeReserves?.map(BigInt);
    this.transferVolumeReserves = sg.transferVolumeReserves?.map(BigInt);
    this.transferVolumeReservesUSD = sg.transferVolumeReservesUSD?.map((r) => parseFloat(r));
    this.transferVolumeUSD = sg.transferVolumeUSD && parseFloat(sg.transferVolumeUSD);
    this.txnHash = sg.hash;
    this.blockNumber = sg.blockNumber && parseInt(sg.blockNumber);
    this.logIndex = sg.logIndex && parseInt(sg.logIndex);
    this.timestamp = sg.timestamp;
  }
}
module.exports = TradeDto;
