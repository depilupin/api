const TractorTask = require('../../../scheduled/tasks/tractor');
const AsyncContext = require('../../../utils/async/context');
const { sequelize } = require('../models');

class DevSeeder {
  static async run() {
    if (process.env.DEV_TRACTOR) {
      await AsyncContext.sequelizeTransaction(async () => {
        await sequelize.query('truncate table tractor_order cascade');
        await sequelize.query('update "ApiMeta" set "lastTractorUpdate" = 29064231;');
      });

      await AsyncContext.run({ chain: 'base' }, async () => {
        while (await TractorTask.updateTractor()) {}
      });
    }
  }
}
module.exports = DevSeeder;
