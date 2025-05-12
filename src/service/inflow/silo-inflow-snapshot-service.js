const SiloInflowSnapshotDto = require('../../repository/dto/inflow/SiloInflowSnapshotDto');
const SeasonDto = require('../../repository/dto/SeasonDto');
const { sequelize } = require('../../repository/postgres/models');
const SiloInflowSnapshotAssembler = require('../../repository/postgres/models/assemblers/inflow/silo-inflow-snapshot-assembler');
const SeasonRepository = require('../../repository/postgres/queries/season-repository');
const SharedRepository = require('../../repository/postgres/queries/shared-repository');
const AsyncContext = require('../../utils/async/context');

class SiloInflowSnapshotService {
  static async takeMissingSnapshots(lastInflowUpdate) {
    // Find max processed season for this block number
    const latestSeason = await SeasonRepository.findMaxSeasonForBlock(lastInflowUpdate);
    if (!latestSeason) {
      return;
    }
    const latestSeasonDto = SeasonDto.fromModel(latestSeason);

    // Find missing seasons within the season number corresponding to that range
    const missingSeasons = await this.findMissingSeasons(latestSeasonDto.season);
    if (missingSeasons.length === 0) {
      return;
    }
    // Always need to include the previous season so deltas can be computed
    missingSeasons.unshift(missingSeasons[0] - 1);
    const seasonsIn = missingSeasons.join(',');

    const [results] = await sequelize.query(
      `with cumulative as (
        select
          s.season,
          s.timestamp,
          s.block,
          sub.bdv as cumulative_bdv,
          sub.usd as cumulative_usd
        from
          season s,
          lateral (
            select sum(bdv) as bdv, sum(usd) as usd from silo_inflow f where f.block < s.block
          ) as sub
          where s.season in (${seasonsIn})
      )
      select
        season,
        block,
        timestamp,
        cumulative_bdv,
        cumulative_usd,
        cumulative_bdv - lag(cumulative_bdv) over (order by block) as delta_bdv,
        cumulative_usd - lag(cumulative_usd) over (order by block) as delta_usd
      from
        cumulative
      order by timestamp asc
      `,
      { transaction: AsyncContext.getOrUndef('transaction') }
    );

    const models = [];
    for (const result of results) {
      const dto = SiloInflowSnapshotDto.fromLiveSnapshot(result);
      models.push(SiloInflowSnapshotAssembler.toModel(dto));
    }

    await SharedRepository.genericUpsert(sequelize.models.SiloInflowSnapshot, models, false);
  }

  static async findMissingSeasons(maxSeason) {
    return await SharedRepository.findMissingSeasons('silo_inflow_snapshot', maxSeason);
  }
}

module.exports = SiloInflowSnapshotService;
