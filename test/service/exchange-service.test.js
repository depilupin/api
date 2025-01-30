const BlockUtil = require('../../src/utils/block');
jest.spyOn(BlockUtil, 'blockForSubgraphFromOptions').mockResolvedValue({ number: 19000000, timestamp: 1705173443 });

const { getTickers, getWellPriceRange, getTrades } = require('../../src/service/exchange-service');
const {
  ADDRESSES: { BEANWETH, BEANWSTETH, WETH, BEAN }
} = require('../../src/constants/raw/beanstalk-eth');
const { mockBasinSG } = require('../util/mock-sg');
const LiquidityUtil = require('../../src/service/utils/pool/liquidity');
const ExchangeService = require('../../src/service/exchange-service');
const { mockBeanstalkConstants } = require('../util/mock-constants');
const ERC20Info = require('../../src/datasources/erc20-info');
const BasinSubgraphRepository = require('../../src/repository/subgraph/basin-subgraph');
const TradeDto = require('../../src/repository/dto/TradeDto');

const testTimestamp = 1715020584;

describe('ExchangeService', () => {
  beforeEach(() => {
    mockBeanstalkConstants();
    jest
      .spyOn(ERC20Info, 'getTokenInfo')
      .mockImplementation((token) => ({ address: token, name: 'a', symbol: 'b', decimals: 6 }));
  });

  it('should return all Basin tickers in the expected format', async () => {
    const wellsResponse = require('../mock-responses/subgraph/basin/wells.json');
    jest.spyOn(mockBasinSG, 'request').mockResolvedValueOnce(wellsResponse);
    // In practice these 2 values are not necessary since the subsequent getWellPriceRange is also mocked.
    jest.spyOn(BasinSubgraphRepository, 'getAllTrades').mockResolvedValueOnce(undefined);
    jest.spyOn(ExchangeService, 'priceEventsByWell').mockResolvedValueOnce(undefined);
    jest.spyOn(LiquidityUtil, 'calcWellLiquidityUSD').mockResolvedValueOnce(27491579.59267346);
    jest.spyOn(LiquidityUtil, 'calcDepth').mockResolvedValueOnce({
      buy: {
        float: [135736.220357, 52.83352694098683]
      },
      sell: {
        float: [139870.493345, 54.44273966436485]
      }
    });

    jest.spyOn(ExchangeService, 'getWellPriceRange').mockReturnValueOnce({
      high: [2544.664349, 0.000392979136931714],
      low: [2606.608683, 0.000383640247389837]
    });

    const tickers = await getTickers({ blockNumber: 19000000 });

    expect(tickers).toHaveLength(1);
    expect(tickers[0].wellAddress).toEqual('0xbea0e11282e2bb5893bece110cf199501e872bad');
    expect(tickers[0].beanToken.address).toEqual('0xbea0000029ad1c77d3d5d23ba2d8893db9d1efab');
    expect(tickers[0].nonBeanToken.address).toEqual('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
    expect(tickers[0].exchangeRates[1]).toBeCloseTo(0.000389236771196659);
    expect(tickers[0].tokenVolume24h.float[0]).toBeCloseTo(362621.652657);
    expect(tickers[0].tokenVolume24h.float[1]).toBeCloseTo(141.01800893122126);
    expect(tickers[0].liquidityUSD).toEqual(27491580);
    expect(tickers[0].depth2.buy[0]).toEqual(135736.220357);
    expect(tickers[0].depth2.buy[1]).toBeCloseTo(52.8335281459809, 5);
    expect(tickers[0].depth2.sell[0]).toEqual(139870.493345);
    expect(tickers[0].depth2.sell[1]).toBeCloseTo(54.44273921546687, 5);
    expect(tickers[0].high[1]).toBeCloseTo(0.000392979136931714, 5);
    expect(tickers[0].low[1]).toBeCloseTo(0.000383640247389837, 5);
  });

  test('Returns correct high/low prices over the given period', () => {
    const mockPriceEvents = require('../mock-responses/exchange/priceChanges.json');
    const mockWellDto = {
      address: BEANWSTETH.toLowerCase(),
      tokenDecimals: () => [6, 18]
    };

    const priceRange = getWellPriceRange(mockWellDto, mockPriceEvents);

    expect(priceRange.high[0]).toEqual(0.000065);
    expect(priceRange.high[1]).toEqual(0.00000000000175889);
    expect(priceRange.low[0]).toEqual(210.587245);
    expect(priceRange.low[1]).toEqual(0.00000001717847889);
  });

  test('Returns swap history', async () => {
    jest
      .spyOn(mockBasinSG, 'request')
      .mockResolvedValueOnce(require('../mock-responses/subgraph/basin/swapHistory.json'));

    const options = {
      ticker_id: `${BEAN}_${WETH}`,
      // These technically arent necessary due to the above mocking
      limit: 10,
      start_time: 1714114912,
      end_time: 1714719712
    };
    const trades = await getTrades(options);

    expect(trades.buy.length).toEqual(1);
    expect(trades.sell.length).toEqual(9);
    expect(trades.buy[0].price).toBeCloseTo(3055.356527);
    expect(trades.buy[0].base_volume).toBeCloseTo(0.46237751579074726);
    expect(trades.buy[0].target_volume).toBeCloseTo(1412.728161);
    expect(trades.buy[0].trade_timestamp).toEqual(1714613735000);
    expect(trades.buy[0].type).toEqual('buy');
  });

  test('Identifies price changes', async () => {
    const tradesResponse = require('../mock-responses/subgraph/basin/trades.json');
    const tradeDtos = tradesResponse.map((t) => new TradeDto(t));

    const mockWells = {
      [BEANWETH.toLowerCase()]: {
        tokenDecimals: () => [6, 18]
      },
      [BEANWSTETH.toLowerCase()]: {
        tokenDecimals: () => [6, 18]
      }
    };

    const priceRange = ExchangeService.priceEventsByWell(mockWells, tradeDtos);
    expect(priceRange[BEANWETH.toLowerCase()].length).toEqual(5);
    expect(priceRange[BEANWSTETH.toLowerCase()].length).toEqual(2);
  });
});
