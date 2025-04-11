const AsyncContext = require('../../../utils/async/context');
const { sequelize, Sequelize } = require('../models');

class TractorOrderRepository {
  static async findAllWithOptions({ criteriaList, limit, skip } = {}) {
    const options = {
      where: {},
      transaction: AsyncContext.getOrUndef('transaction')
    };

    // Apply optional values when provided
    if (criteriaList && criteriaList.length > 0) {
      options.where = {
        [Sequelize.Op.and]: criteriaList
      };
    }

    options.limit = limit;
    if (skip) {
      options.offset = skip;
    }

    const { rows: orders, count } = await sequelize.models.TractorOrder.findAndCountAll(options);
    return { orders, total: count };
  }
}
module.exports = TractorOrderRepository;
