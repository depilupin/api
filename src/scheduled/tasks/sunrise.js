const SiloService = require('../../service/silo-service');
const YieldService = require('../../service/yield-service');
const Log = require('../../utils/logging');
const OnSunriseUtil = require('../util/on-sunrise');
const DepositsTask = require('./deposits');

class SunriseTask {
  static async handleSunrise() {
    Log.info('Waiting for sunrise to be processed by subgraphs...');
    while (true) {
      try {
        // Wait 5.5 mins at a time, fails + notifies if unsuccessful
        await OnSunriseUtil.waitForSunrise(5.5 * 60 * 1000);
        break;
      } catch (e) {
        Log.info('Sunrise not detected yet, sent notification and still waiting...');
      }
    }
    Log.info('Sunrise was processed by the subgraphs, proceeding.');

    // Update whitelisted token info
    const tokenModels = await SiloService.updateWhitelistedTokenInfo();

    await YieldService.saveSeasonalApys({ tokenModels });

    // Next deposit update should mow all/etc.
    DepositsTask.__seasonUpdate = true;
  }
}

module.exports = SunriseTask;
