const { TRACTOR_ORDER_TABLE } = require('../../../constants/tables');
const { bigintNumericColumn, largeBigintTextColumn } = require('../util/sequelize-util');
const { TractorOrderType } = require('./types/types');

module.exports = (sequelize, DataTypes) => {
  const TractorOrder = sequelize.define(
    'TractorOrder',
    {
      blueprintHash: {
        type: DataTypes.STRING(66),
        primaryKey: true
      },
      orderType: {
        type: DataTypes.ENUM,
        values: Object.values(TractorOrderType),
        allowNull: true
      },
      publisher: {
        type: DataTypes.STRING(42),
        allowNull: false
      },
      data: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      // abi encoded bytes32[]
      operatorPasteInstrs: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      ...largeBigintTextColumn('maxNonce', DataTypes, { allowNull: false }),
      startTime: {
        type: DataTypes.DATE,
        allowNull: false
      },
      endTime: {
        type: DataTypes.DATE,
        allowNull: false
      },
      signature: {
        type: DataTypes.STRING(132),
        allowNull: false
      },
      // Timestamp/block number of when this blueprint was published
      publishedTimestamp: {
        type: DataTypes.DATE,
        allowNull: false
      },
      publishedBlock: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Amount of tip in beans (if applicable).
      // Tips aren't required or guaranteed to be in bean, but should be in practice.
      ...bigintNumericColumn('beanTip', DataTypes, { allowNull: true }),
      cancelled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }
      // TODO: add a field to indicate whether the order can be executed this season
      // Or is it better to add a last executable season number? If an order is executable during this season,
      // and then later during the season it isnt, the boolean should remain true.
    },
    {
      tableName: TRACTOR_ORDER_TABLE.env,
      indexes: [
        {
          fields: ['orderType']
        },
        {
          fields: ['publisher']
        }
      ]
    }
  );

  return TractorOrder;
};
