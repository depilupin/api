const FilterLogs = require('../../datasources/events/filter-logs');
const TractorOrderDto = require('../../repository/dto/tractor/TractorOrderDto');
const AppMetaService = require('../../service/meta-service');
const TractorService = require('../../service/tractor-service');
const Concurrent = require('../../utils/async/concurrent');
const AsyncContext = require('../../utils/async/context');
const Log = require('../../utils/logging');
const TaskRangeUtil = require('../util/task-range');
const TractorSowV0Task = require('./tractor-blueprints/sow-v0');

// Maximum number of blocks to process in one invocation
const MAX_BLOCKS = 2000;

class TractorTask {
  static knownBlueprints() {
    return [TractorSowV0Task];
  }

  // Returns true if the task can be called again immediately
  static async updateTractor() {
    let { isInitialized, lastUpdate, updateBlock, isCaughtUp } = await TaskRangeUtil.getUpdateInfo(
      AppMetaService.getTractorMeta.bind(AppMetaService),
      MAX_BLOCKS
    );
    if (!isInitialized || lastUpdate === updateBlock) {
      Log.info(`Skipping task, has not been initialized yet or last update is the same as the suggested update block.`);
      return false;
    }
    Log.info(`Updating tractor for block range [${lastUpdate}, ${updateBlock}]`);

    // Find all PublishRequisiton and Tractor events
    const events = await FilterLogs.getBeanstalkEvents(['PublishRequisition', 'Tractor'], 28723812, 28723992);
    // const events = await FilterLogs.getBeanstalkEvents(['PublishRequisition', 'Tractor'], lastUpdate+1, updateBlock); // TODO: put back

    // Event processing can occur in parallel, but ensure all requisitions are created first
    await AsyncContext.sequelizeTransaction(async () => {
      await this.processEventsConcurrently(events, 'PublishRequisition', this.handlePublishRequsition.bind(this));
      await this.processEventsConcurrently(events, 'Tractor', this.handleTractor.bind(this));

      // Run periodicUpdate on specialized blueprint modules
      await Promise.all(this.knownBlueprints().map((b) => b.periodicUpdate(lastUpdate + 1, updateBlock)));

      await AppMetaService.setLastTractorUpdate(updateBlock);
    });

    return !isCaughtUp;
  }

  static async handlePublishRequsition(event) {
    const dto = await TractorOrderDto.fromRequisitionEvt(event);
    const [inserted] = await TractorService.updateOrders([dto]);

    // Additional processing if this requisition corresponds to a known blueprint
    for (const blueprintTask of this.knownBlueprints()) {
      const tipAmount = await blueprintTask.tryAddRequisition(inserted, event.args.requisition.blueprint.data);
      if (tipAmount) {
        inserted.orderType = blueprintTask.orderType;
        inserted.beanTip = tipAmount;
        await TractorService.updateOrders([inserted]);
      }
    }
  }

  static async handleTractor(event) {
    // Find all events for the txn and isolate to within log range
  }

  static async processEventsConcurrently(allEvents, eventName, handler) {
    const events = allEvents.filter((e) => e.name === eventName);
    const TAG = Concurrent.tag(eventName);
    for (const event of events) {
      await Concurrent.run(TAG, 50, async () => {
        await handler(event);
      });
    }
    await Concurrent.allResolved(TAG);
  }
}
module.exports = TractorTask;
