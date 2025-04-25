const { C } = require('../../src/constants/runtime-constants');
const SowV0ExecutionDto = require('../../src/repository/dto/tractor/SowV0ExecutionDto');
const SowV0OrderDto = require('../../src/repository/dto/tractor/SowV0OrderDto');
const PriceService = require('../../src/service/price-service');
const TractorSowV0Service = require('../../src/service/tractor/blueprints/sow-v0');

describe('TractorSowV0Service', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('Creates additional order data for matching requisition', async () => {
    jest
      .spyOn(TractorSowV0Service, 'decodeBlueprintData')
      .mockReturnValue({ args: { params: { opParams: { operatorTipAmount: 456n } } } });
    jest.spyOn(SowV0OrderDto, 'fromBlueprintCalldata').mockReturnValue('dto');
    const upsertSpy = jest.spyOn(TractorSowV0Service, 'updateOrders').mockImplementation(() => {});

    const result = await TractorSowV0Service.tryAddRequisition({ blueprintHash: 123 }, 'data');

    expect(result).toBe(456n);
    expect(upsertSpy).toHaveBeenCalledWith(['dto']);
  });

  it('Creates matching execution data for order executed', async () => {
    const mockOrderDto = { blueprintHash: '0x123' };
    const mockInnerEvents = [
      {
        name: 'OperatorReward',
        args: {
          token: C().BEAN,
          amount: '1100000'
        },
        rawLog: { blockNumber: 123456 }
      }
    ];
    const mockSowOrder = {
      updateFieldsUponExecution: jest.fn()
    };
    const getOrderSpy = jest.spyOn(TractorSowV0Service, 'getOrder').mockResolvedValue(mockSowOrder);
    const updateOrderSpy = jest.spyOn(TractorSowV0Service, 'updateOrders').mockImplementation(() => {});
    jest.spyOn(SowV0ExecutionDto, 'fromExecutionContext').mockImplementation(() => {});
    const updateExecutionSpy = jest.spyOn(TractorSowV0Service, 'updateExecutions').mockImplementation(() => {});
    const priceSpy = jest.spyOn(PriceService, 'getBeanPrice').mockResolvedValue({ usdPrice: 1.5 });

    const result = await TractorSowV0Service.orderExecuted(mockOrderDto, null, mockInnerEvents);

    expect(getOrderSpy).toHaveBeenCalledWith(mockOrderDto.blueprintHash);
    expect(mockSowOrder.updateFieldsUponExecution).toHaveBeenCalledWith(mockInnerEvents);
    expect(updateOrderSpy).toHaveBeenCalledWith([mockSowOrder]);
    expect(updateExecutionSpy).toHaveBeenCalled();
    expect(priceSpy).toHaveBeenCalledWith({ blockNumber: 123456 });
    expect(result).toBeCloseTo(1.65, 5);
  });

  test('Ignores other requisitions', async () => {
    const dtoSpy = jest.spyOn(SowV0OrderDto, 'fromBlueprintCalldata');

    const result = await TractorSowV0Service.tryAddRequisition({ blueprintHash: 123 }, 'data');

    expect(result).not.toBeDefined();
    expect(dtoSpy).not.toHaveBeenCalled();
  });

  test('Successfully decodes matching event', () => {
    const requisitionBlueprintData =
      '0x36bfafbd0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000042000000000000000000000000000000000000000000000000000000000000003a4b452c7ae0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000bb0a41927895F8ca2b4ECCc659ba158735fCF28B000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002e000000000000000000000000000000000000000000000000000000000000002443ca8e1b20000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000001a00000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000001dcd6500000000000000000000000000000000000000000000000000000000000ee6b280000000000000000000000000000000000000000000000000000000002faf080000000000000000000000000000000000000000000000000000000000004c4b4000000000000000000000000000000000000000000000000000003bc8b295a6d000000000000000000000000000000000000000000000021e19e0c9bab2400000000000000000000000000000000000000000000000000000000000000000012c0000000000000000000000000000000000000000000000000de0b6b3a7640000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000ff0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f424000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
    expect(TractorSowV0Service.decodeBlueprintData(requisitionBlueprintData)).toBeDefined();
  });
});
