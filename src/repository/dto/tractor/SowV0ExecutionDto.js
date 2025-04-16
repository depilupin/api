const Contracts = require('../../../datasources/contracts/contracts');
const BlueprintConstants = require('../../../service/tractor-blueprints/blueprint-constants');
const { fromBigInt } = require('../../../utils/number');

class SowV0ExecutionDto {
  constructor(type, d) {
    if (type === 'data') {
      const { executionDto, innerEvents } = d;
      const sowEvt = innerEvents.find((e) => e.name === 'Sow');

      this.id = executionDto.id;
      this.blueprintHash = executionDto.blueprintHash;
      this.index = BigInt(sowEvt.args.index);
      this.beans = BigInt(sowEvt.args.beans);
      this.pods = BigInt(sowEvt.args.pods);
      this.placeInLine = null; // Needs async, will be set outside
      this.usedTokens = null; // Needs async, will be set outside
      this.usedGrownStalkPerBdv = null; // Needs async, will be set outside
    } else if (type === 'db') {
      this.id = d.id;
      this.blueprintHash = d.blueprintHash;
      this.index = d.index;
      this.beans = d.beans;
      this.pods = d.pods;
      this.placeInLine = d.placeInLine;
      this.usedTokens = d.usedTokenIndices
        .split(',')
        .map(Number)
        .map((index) => BlueprintConstants.tokenIndexReverseMap()[index]);
      this.usedGrownStalkPerBdv = d.usedGrownStalkPerBdv;
    }
  }

  static async fromExecutionContext(sowExecutionContext) {
    const sowExecutionDto = new SowV0ExecutionDto('data', sowExecutionContext);

    // Assign place in line
    const sowEvt = sowExecutionContext.innerEvents.find((e) => e.name === 'Sow');
    const harvestableIndex = await Contracts.getBeanstalk().harvestableIndex(sowEvt.args.fieldId, {
      blockTag: sowEvt.rawLog.blockNumber
    });
    sowExecutionDto.placeInLine = BigInt(sowEvt.args.index) - BigInt(harvestableIndex);

    // Assign usedTokens, usedGrownStalkPerBdv according to withdraw events
    await sowExecutionDto.determineWithdrawnTokens(sowExecutionContext.innerEvents);

    return sowExecutionDto;
  }

  static fromModel(dbModel) {
    return new SowV0ExecutionDto('db', dbModel);
  }

  async determineWithdrawnTokens(innerEvents) {
    const removeDeposits = innerEvents.filter((e) => ['RemoveDeposits', 'RemoveDeposit'].includes(e.name));

    let totalBdvWithdrawn = 0;
    let totalGrownStalkWithdrawn = 0;
    this.usedTokens = [];
    for (const evt of removeDeposits) {
      const token = evt.args.token.toLowerCase();
      if (!this.usedTokens.includes(token) && token in BlueprintConstants.tokenIndexMap()) {
        this.usedTokens.push(token);
      }
      // Support both RemoveDeposits and RemoveDeposit
      const bdvs = (evt.args.bdvs ?? [evt.args.bdv]).map(BigInt);
      const stems = (evt.args.stems ?? [evt.args.stem]).map(BigInt);
      const stemTip = BigInt(
        await Contracts.getBeanstalk().stemTipForToken(token, { blockTag: evt.rawLog.blockNumber })
      );
      for (let i = 0; i < bdvs.length; i++) {
        totalBdvWithdrawn += fromBigInt(bdvs[i], 6);
        totalGrownStalkWithdrawn += fromBigInt(bdvs[i] * (stemTip - stems[i]), 16);
      }
    }

    this.usedGrownStalkPerBdv = totalGrownStalkWithdrawn / totalBdvWithdrawn;
  }
}

module.exports = SowV0ExecutionDto;
