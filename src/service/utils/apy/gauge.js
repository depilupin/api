/**
 * @typedef {import('../../../types/types').CalcApyOptions} CalcApyOptions
 * @typedef {import('../../../types/types').DepositYieldMap} DepositYieldMap
 */

const { C } = require('../../../constants/runtime-constants');
const { ApyInitType } = require('../../../repository/postgres/models/types/types');
const { fromBigInt, sum } = require('../../../utils/number');

const GPFunction = require('./gp-functions/gp-function');

class GaugeApyUtil {
  /**
   * Calculates silo Bean/Stalk vAPY when Seed Gauge is active.
   *
   * All of the array parameters should not be empty and be the same length, with one entry for every gauge lp deposit type
   *
   * @param {BigInt} beansPerSeason - The provided EMA
   * @param {string[]} tokenNames (informational) - The token(s) calculating on
   * @param {number[]} tokens - Which tokens to calculate the apy for. For a gauge lp token,
   *        provide an index corresponding to the position of that lp in the other array parameters.
   *        For Bean, provide -1. For a non-gauge token, provide -2. See staticSeeds parameter below
   * @param {BigInt[]} gaugeLpPoints - Array of gauge points assigned to each gauge lp. With a single lp, there will be one entry
   * @param {BigInt[]} gaugeLpDepositedBdv - Array of deposited bdv corresponding to each gauge lp. Initial values include germinating.
   * @param {BigInt} nonGaugeDepositedBdv - Amount of (whitelisted) deposited bdv that is not tracked by the gauge system. Initial value includes germinating.
   * @param {BigInt[]} gaugeLpOptimalPercentBdv - Array of optimal bdv percentages for each lp
   * @param {BigInt} initialR - Initial ratio of max LP gauge points per bdv to Bean gauge points per bdv
   * @param {BigInt} siloDepositedBeanBdv - The total number of Beans in the silo. Initial value includes germinating.
   * @param {BigInt} siloStalk - The total amount of stalk in the silo, not including germinating stalk.
   *
   * GERMINATING PARAMS - First index corresponds to Even germinating, second index is Odd.
   * These germinating amounts will be subtracted from the above values initially, and re-inlcuded once germination completes.
   *
   * @param {number} season - The current season, required for germinating and parameter changes over time.
   * @param {BigInt[]} germinatingBeanBdv - Germinating beans bdv
   * @param {BigInt[][]} gaugeLpGerminatingBdv - Germinating bdv of each gauge lp. Each outer array entry corresponds to one lp
   * @param {BigInt[]} nonGaugeGerminatingBdv - Germinating bdv of all non-gauge whitelisted assets
   *
   * UNRIPE
   *
   * @param {Array<BigInt | null>} staticSeeds - Provided when `tokens[?]` does not have its seeds dynamically changed by gauge
   *
   * OTHER
   *
   * @param {CalcApyOptions} options - optional configuration
   *
   * Assumptions:
   * 1 germinating bdv will add 1 stalk to the system when germination completes.
   *
   * Future work includes improvement of the `r` value simulation. This involves using Beanstalk's current state,
   * including L2SR and debt level (temperature cases). Also can be improved by tracking an expected ratio of
   * seasons with mints to seasons without mints. This will allow for a more accurate simulation of its fluctuation.
   *
   * @returns {DepositYieldMap}
   */
  static calcApy(
    beansPerSeason,
    tokenNames,
    tokens,
    gaugeLpPoints,
    gaugeLpDepositedBdv,
    nonGaugeDepositedBdv,
    gaugeLpOptimalPercentBdv,
    initialR,
    siloDepositedBeanBdv,
    siloStalk,
    season,
    germinatingBeanBdv,
    gaugeLpGerminatingBdv,
    nonGaugeGerminatingBdv,
    staticSeeds,
    options
  ) {
    // In practice this probably doesnt need to get updated as seasons pass in the simulation
    let PRECISION = C(season).DECIMALS;

    const catchUpRate = options?.catchUpRate ?? 4320;
    const duration = options?.duration ?? 8760;

    if (!options.initType && ![ApyInitType.NEW, ApyInitType.AVERAGE].includes(options.initType)) {
      throw new Error(`Unrecognized initType ${options.initType}`);
    }

    let gaugeLpGermSum = 0;
    let beanGerm = GaugeApyUtil.#sumGerminatingBdv(germinatingBeanBdv, PRECISION.bdv);
    let nonGaugeGerm = GaugeApyUtil.#sumGerminatingBdv(nonGaugeGerminatingBdv, PRECISION.bdv);
    let sysGerm = gaugeLpGermSum + beanGerm + nonGaugeGerm;

    // Current LP GP allocation per BDV
    const lpGpPerBdv = [];
    // Transform these inputs
    const gaugeLpPointsCopy = [];
    const gaugeLpDepositedBdvCopy = [];
    const gaugeLpOptimalPercentBdvCopy = [];
    for (let i = 0; i < gaugeLpPoints.length; ++i) {
      const points = fromBigInt(gaugeLpPoints[i], PRECISION.gaugePoints, PRECISION.gaugePoints / 3);
      const gaugeLpGerm = GaugeApyUtil.#sumGerminatingBdv(gaugeLpGerminatingBdv[i], PRECISION.bdv);
      const bdv = fromBigInt(gaugeLpDepositedBdv[i], PRECISION.bdv, PRECISION.bdv / 3) - gaugeLpGerm;
      gaugeLpGermSum += gaugeLpGerm;
      lpGpPerBdv.push(points / bdv);
      gaugeLpPointsCopy.push(points);
      gaugeLpDepositedBdvCopy.push(bdv);
      gaugeLpOptimalPercentBdvCopy.push(fromBigInt(gaugeLpOptimalPercentBdv[i], PRECISION.optimalPercentDepositedBdv));
    }

    // Current percentages allocations of each LP
    const currentPercentLpBdv = [];
    let sumLpBdv = sum(gaugeLpDepositedBdvCopy);
    for (let i = 0; i < gaugeLpDepositedBdvCopy.length; ++i) {
      currentPercentLpBdv.push((gaugeLpDepositedBdvCopy[i] / sumLpBdv) * 100);
    }

    let r = fromBigInt(initialR, PRECISION.beanToMaxLpGpPerBdvRatio, PRECISION.beanToMaxLpGpPerBdvRatio / 2);
    let cropRatio;
    const siloReward = fromBigInt(beansPerSeason, PRECISION.bdv, PRECISION.bdv);
    let beanBdv = fromBigInt(siloDepositedBeanBdv, PRECISION.bdv, PRECISION.bdv / 3) - beanGerm;
    let totalStalk = fromBigInt(siloStalk, PRECISION.stalk, 0);
    let gaugeBdv = beanBdv + sum(gaugeLpDepositedBdvCopy);
    let nonGaugeDepositedBdv_ = fromBigInt(nonGaugeDepositedBdv, PRECISION.bdv, PRECISION.bdv / 3) - nonGaugeGerm;
    let totalBdv = gaugeBdv + nonGaugeDepositedBdv_;
    let largestLpGpPerBdv = Math.max(...lpGpPerBdv);

    // Set initial user values, accounting for when the system is at zero stlak
    const avgSysStalk = totalStalk / totalBdv;

    const userBeans = [];
    const userLp = [];
    const userStalk = [];
    const userGerminating = [];
    const userOwnership = [];
    for (let i = 0; i < tokens.length; ++i) {
      userBeans.push(tokens[i] === -1 ? 1 : 0);
      userLp.push(tokens[i] === -1 ? 0 : 1);
      userStalk.push(
        options?.initUserValues?.[i]?.stalkPerBdv ??
          (options.initType === ApyInitType.AVERAGE && !isNaN(avgSysStalk)
            ? avgSysStalk
            : // New deposit starts with 0 stalk (all germinating)
              0)
      );
      // These amounts will be added to user stalk as the germination period finishes
      userGerminating.push(
        options?.initUserValues?.[i]?.germinating ??
          (options.initType === ApyInitType.AVERAGE && !isNaN(avgSysStalk)
            ? // Assume average deposit has no germinating
              [0, 0]
            : // Set germination to finish after 2 seasons
              [season % 2 == 0 ? 1 : 0, season % 2 == 0 ? 0 : 1])
      );
      userOwnership.push(userStalk[i] / totalStalk);
    }

    const bdvStart = userBeans.map((_, idx) => Math.max(userBeans[idx], userLp[idx]));
    // Include germinating stalk in initial stalk/ownership
    const stalkStart = userStalk.map((s, idx) => s + userGerminating[idx][0] + userGerminating[idx][1]);
    const ownershipStart = stalkStart.map((s) => s / (totalStalk + sysGerm));

    for (let i = 0; i < duration; ++i) {
      [r, cropRatio] = GaugeApyUtil.#updateCropRatio(season, r, beansPerSeason);

      // Add germinating bdv to actual bdv in the first 2 simulated seasons
      if (i < 2) {
        const index = (season + 1 + i) % 2 == 0 ? 1 : 0;
        beanBdv += fromBigInt(germinatingBeanBdv[index], PRECISION.bdv, PRECISION.bdv / 3);
        for (let j = 0; j < gaugeLpDepositedBdvCopy.length; ++j) {
          gaugeLpDepositedBdvCopy[j] += fromBigInt(gaugeLpGerminatingBdv[j][index], PRECISION.bdv, PRECISION.bdv / 3);
        }
        sumLpBdv = sum(gaugeLpDepositedBdvCopy);
        for (let j = 0; j < gaugeLpDepositedBdvCopy.length; ++j) {
          currentPercentLpBdv[j] = (gaugeLpDepositedBdvCopy[j] / sumLpBdv) * 100;
        }
        gaugeBdv = beanBdv + sum(gaugeLpDepositedBdvCopy);
        nonGaugeDepositedBdv_ += fromBigInt(nonGaugeGerminatingBdv[index], PRECISION.bdv, PRECISION.bdv / 3);

        // bdv that finished germinating. Increase total bdv/stalk
        const newBdv = gaugeBdv + nonGaugeDepositedBdv_ - totalBdv;
        totalBdv += newBdv;
        totalStalk += newBdv;
      }

      // Handle multiple whitelisted gauge LP, or gauge points changing during germination
      if (gaugeLpPoints.length > 1 || i < 2) {
        for (let j = 0; j < gaugeLpDepositedBdvCopy.length; ++j) {
          gaugeLpPointsCopy[j] = GPFunction.forSeason(
            season + i + 1,
            gaugeLpPointsCopy[j],
            gaugeLpOptimalPercentBdvCopy[j],
            currentPercentLpBdv[j]
          );
          lpGpPerBdv[j] = gaugeLpPointsCopy[j] / gaugeLpDepositedBdvCopy[j];
        }
        largestLpGpPerBdv = Math.max(...lpGpPerBdv);
      }

      const beanGpPerBdv = largestLpGpPerBdv * cropRatio;
      const gpTotal = sum(gaugeLpPointsCopy) + beanGpPerBdv * beanBdv;
      const avgGsPerBdv = totalStalk / totalBdv - 1;
      const gs = (avgGsPerBdv / catchUpRate) * gaugeBdv;
      const beanSeedsGs = (gs / gpTotal) * beanGpPerBdv;

      totalStalk += gs + siloReward;
      gaugeBdv += siloReward;
      totalBdv += siloReward;
      beanBdv += siloReward;

      for (let j = 0; j < tokens.length; ++j) {
        let lpSeedsGs = 0;
        if (tokens[j] !== -1) {
          if (tokens[j] < 0) {
            lpSeedsGs = fromBigInt(staticSeeds[j], PRECISION.seeds) / 10000;
          } else {
            lpSeedsGs = (gs / gpTotal) * lpGpPerBdv[tokens[j]];
          }
        }

        const userBeanShare = siloReward * userOwnership[j];
        userStalk[j] += userBeanShare + userBeans[j] * beanSeedsGs + userLp[j] * lpSeedsGs;
        userBeans[j] += userBeanShare;
        if (i < 2) {
          const index = (season + 1 + i) % 2 == 0 ? 1 : 0;
          userStalk[j] += userGerminating[j][index];
        }
        userOwnership[j] = userStalk[j] / totalStalk;
      }
    }
    // Return yields
    return tokenNames.reduce((result, token, idx) => {
      result[token] = {
        bean: (userBeans[idx] + userLp[idx] - bdvStart[idx]) / bdvStart[idx],
        stalk: (userStalk[idx] - stalkStart[idx]) / stalkStart[idx],
        ownership: (userOwnership[idx] - ownershipStart[idx]) / ownershipStart[idx]
      };
      return result;
    }, {});
  }

  // Updates the crop ratio, returning the raw beanToMaxLpGpPerBdvRatio and the scaled crop ratio
  static #updateCropRatio(apySeason, R, earnedBeans) {
    let range;
    if (apySeason <= 2710) {
      range = [0.5, 1];
    } else if (apySeason <= 3000) {
      // TODO: Replace 3000 with season number at time of PI-8 Deployment
      range = [0.5, 1.5];
    } else {
      range = [0.5, 2];
    }
    // For now we return an increasing R value only when there are no beans minted over the period.
    // In the future this needs to take into account beanstalk state and the frequency of how many seasons have mints
    const change = earnedBeans == 0 ? 0.01 : -0.01;
    let newR = R + change;
    if (newR > 1) {
      newR = 1;
    } else if (newR < 0) {
      newR = 0;
    }
    return [newR, range[0] + (range[1] - range[0]) * newR];
  }

  /**
   * Returns the sum of germinating bdvs as a number
   * @param {BigInt[]} germinating - germinating bdv
   * @param {Number} bdvPrecision - decimals for bdv
   */
  static #sumGerminatingBdv(germinating, bdvPrecision) {
    return (
      fromBigInt(germinating[0], bdvPrecision, bdvPrecision / 3) +
      fromBigInt(germinating[1], bdvPrecision, bdvPrecision / 3)
    );
  }
}

module.exports = GaugeApyUtil;
