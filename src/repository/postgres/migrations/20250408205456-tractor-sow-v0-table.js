'use strict';

const { timestamps, bigintNumericColumn } = require('../util/sequelize-util');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tractor_sow_v0', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      executionId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'tractor_execution',
          key: 'id'
        },
        onDelete: 'RESTRICT',
        allowNull: false
      },
      ...bigintNumericColumn('pintoSownCounter', Sequelize, { allowNull: false }),
      lastExecutedSeason: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      orderComplete: {
        type: Sequelize.BOOLEAN,
        allowNull: false
      },
      ...bigintNumericColumn('amountFunded', Sequelize, { allowNull: false }),
      ...bigintNumericColumn('cascadeAmountFunded', Sequelize, { allowNull: false }),
      sourceTokenIndices: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      ...bigintNumericColumn('totalAmountToSow', Sequelize, { allowNull: false }),
      ...bigintNumericColumn('minAmountToSowPerSeason', Sequelize, { allowNull: false }),
      ...bigintNumericColumn('maxAmountToSowPerSeason', Sequelize, { allowNull: false }),
      ...bigintNumericColumn('minTemp', Sequelize, { allowNull: false }),
      ...bigintNumericColumn('maxPodlineLength', Sequelize, { allowNull: false }),
      ...bigintNumericColumn('maxGrownStalkPerBdv', Sequelize, { allowNull: false }),
      ...bigintNumericColumn('runBlocksAfterSunrise', Sequelize, { allowNull: false }),
      ...bigintNumericColumn('slippageRatio', Sequelize, { allowNull: false }),
      ...timestamps(Sequelize)
    });

    await queryInterface.addIndex('tractor_sow_v0', ['executionId']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('tractor_sow_v0');
  }
};
