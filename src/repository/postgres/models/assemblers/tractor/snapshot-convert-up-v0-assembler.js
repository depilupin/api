const SnapshotConvertUpV0Dto = require('../../../../dto/tractor/SnapshotConvertUpV0Dto');

class SnapshotConvertUpV0Assembler {
  static toModel(snapshotDto) {
    return {
      id: snapshotDto.id,
      snapshotTimestamp: snapshotDto.snapshotTimestamp,
      snapshotBlock: snapshotDto.snapshotBlock,
      season: snapshotDto.season,
      totalBeansConverted: snapshotDto.totalBeansConverted,
      totalGsBonusStalk: snapshotDto.totalGsBonusStalk,
      totalGsBonusBdv: snapshotDto.totalGsBonusBdv,
      totalGsPenaltyStalk: snapshotDto.totalGsPenaltyStalk,
      totalGsPenaltyBdv: snapshotDto.totalGsPenaltyBdv,
      totalCascadeFunded: snapshotDto.totalCascadeFunded,
      totalTipsPaid: snapshotDto.totalTipsPaid,
      currentMaxTip: snapshotDto.currentMaxTip,
      totalExecutions: snapshotDto.totalExecutions,
      uniquePublishers: snapshotDto.uniquePublishers
    };
  }

  static fromModel(snapshotModel) {
    return SnapshotConvertUpV0Dto.fromModel(snapshotModel);
  }
}
module.exports = SnapshotConvertUpV0Assembler;
