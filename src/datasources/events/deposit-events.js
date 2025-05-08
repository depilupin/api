const Log = require('../../utils/logging');
const AlchemyUtil = require('../alchemy');
const FilterLogs = require('./filter-logs');

const DEPOSIT_EVENTS = ['AddDeposit', 'RemoveDeposit', 'RemoveDeposits'];

class DepositEvents {
  // Returns a summary of add/remove deposit events
  static async getSiloDepositEvents(fromBlock, toBlock = 'latest') {
    const events = await FilterLogs.getBeanstalkEvents(DEPOSIT_EVENTS, { fromBlock, toBlock });
    return this.collapseDepositEvents(events);
  }

  // Collapses RemoveDeposits out of its array form
  static collapseDepositEvents(events) {
    const collapsed = [];
    for (const e of events) {
      if (e.name === 'RemoveDeposits') {
        for (let i = 0; i < e.args.stems.length; ++i) {
          collapsed.push({
            type: -1,
            account: e.args.account.toLowerCase(),
            token: e.args.token.toLowerCase(),
            stem: BigInt(e.args.stems[i]),
            amount: BigInt(e.args.amounts[i]),
            bdv: BigInt(e.args.bdvs[i])
          });
        }
      } else {
        collapsed.push({
          type: e.name === 'AddDeposit' ? 1 : -1,
          account: e.args.account.toLowerCase(),
          token: e.args.token.toLowerCase(),
          stem: BigInt(e.args.stem),
          amount: BigInt(e.args.amount),
          bdv: BigInt(e.args.bdv)
        });
      }
    }
    return collapsed;
  }

  // Returns condensed info from StalkBalanceChanged
  static async getStalkBalanceChangedEvents(fromBlock, toBlock = 'latest') {
    const rawEvents = await FilterLogs.getBeanstalkEvents(['StalkBalanceChanged'], { fromBlock, toBlock });
    const summary = [];
    for (const event of rawEvents) {
      summary.push({
        account: event.args.account.toLowerCase(),
        deltaStalk: BigInt(event.args.delta),
        blockNumber: event.rawLog.blockNumber
      });
    }
    return summary;
  }

  static removeConvertRelatedEvents(addRemoveEvents, convertEvents) {
    for (const convert of convertEvents) {
      const removeDepositIndex = addRemoveEvents.findIndex(
        (e) =>
          e.args.account === convert.args.account &&
          e.args.token === convert.args.fromToken &&
          BigInt(e.args.amount) === BigInt(convert.args.fromAmount)
      );
      const addDepositIndex = addRemoveEvents.findIndex(
        (e) =>
          e.args.account === convert.args.account &&
          e.args.token === convert.args.toToken &&
          BigInt(e.args.amount) === BigInt(convert.args.toAmount)
      );
      if (removeDepositIndex !== -1 && addDepositIndex !== -1) {
        addRemoveEvents.splice(removeDepositIndex, 1);
        // Adjust second index if it comes after the first removed item
        const adjustedAddIndex = addDepositIndex > removeDepositIndex ? addDepositIndex - 1 : addDepositIndex;
        addRemoveEvents.splice(adjustedAddIndex, 1);
      } else {
        Log.info(`Convert in ${convert.rawLog.transactionHash} failed to match add/remove deposit(s)`);
      }
    }
  }

  static removePickRelatedEvents(addRemoveEvents, pickEvents) {
    // Output an error if Pick doesnt match with add deposit
  }

  // Sums the net deposit/withdrawal for each token in these events
  // TODO: consider account
  static netDeposits(addRemoveEvents) {
    const collapsed = this.collapseDepositEvents(addRemoveEvents);
    const net = {};
    for (const e of collapsed) {
      net[e.token] ??= {
        amount: 0n,
        bdv: 0n
      };
      net[e.token].amount += BigInt(e.type) * e.amount;
      net[e.token].bdv += BigInt(e.type) * e.bdv;
    }

    for (const token in net) {
      if (net[token].amount === 0n) {
        delete net[token];
      }
    }
    return net;
  }
}
module.exports = DepositEvents;

if (require.main === module) {
  (async () => {
    await AlchemyUtil.ready('base');
    // const logs = await DepositEvents.getSiloDepositEvents(264547404);
    // console.log(logs.filter((l) => l.name === 'AddDeposit')[0]);
    // console.log(logs.filter((l) => l.name === 'RemoveDeposit')[0]);
    // console.log(logs.filter((l) => l.name === 'RemoveDeposits')[0].args.stems);
    // console.log(await DepositEvents.getSiloDepositEvents(264547404));
    console.log(await DepositEvents.getStalkBalanceChangedEvents(25600457, 25602057));
  })();
}
