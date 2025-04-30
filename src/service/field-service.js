const Contracts = require('../datasources/contracts/contracts');
const BeanstalkSubgraphRepository = require('../repository/subgraph/beanstalk-subgraph');
const { BigInt_min, BigInt_max } = require('../utils/bigint');
const { toBigInt, fromBigInt } = require('../utils/number');

const BUCKET_SIZE = 50000;
const CACHE_DURATION = 1000 * 60 * 30; // 30 mins
const CACHEABLE_VALUES = [10000, 25000, 50000, 100000];

class FieldService {
  static _resultCache = {};
  static get cache() {
    return FieldService._resultCache;
  }

  // Returns summary information on ranges of plots.
  // The current logic with harvested plots is not correct, as it doesn't account for them becoming harvestable.
  // Some plots are harvestable but haven't been harvested yet. The datapoints needed for fully correct analysis
  // are not currently available.
  static async getAggregatePlotSummary(
    { bucketSize, onlyHarvested, onlyUnharvested } = {
      bucketSize: BUCKET_SIZE,
      onlyHarvested: false,
      onlyUnharvested: false
    }
  ) {
    const cacheKey = `${bucketSize}-${onlyHarvested}-${onlyUnharvested}`;
    const cachedResult = this.cache[cacheKey];
    if (cachedResult && cachedResult.timestamp > Date.now() - CACHE_DURATION) {
      return cachedResult.result;
    }

    let [plots, harvestableIndex] = await Promise.all([
      BeanstalkSubgraphRepository.getAllPlots(),
      (async () => BigInt(await Contracts.getBeanstalk().harvestableIndex(0)))()
    ]);
    plots = plots.filter((plot) => {
      if (onlyHarvested && !plot.harvestAt) return false;
      if (onlyUnharvested && plot.index < harvestableIndex) return false;
      return true;
    });

    const results = [];

    const applyAPR = (plot, addedPods) => {
      if (plot.harvestAt) {
        const timeToHarvest = plot.harvestAt.getTime() - plot.sowTimestamp.getTime();
        const plotAPR = ((1 / fromBigInt(plot.sownBeansPerPod, 6) - 1) / timeToHarvest) * 365 * 24 * 60 * 60 * 1000;
        currentResult.avgAPR = (currentResult.avgAPR || 0) + plotAPR * (fromBigInt(addedPods, 6) / bucketSize);
      }
    };

    let currentResult = null;
    for (let i = 0; i < plots.length; i++) {
      const plot = plots[i];
      const plotEnd = plot.index + plot.pods;
      if (!currentResult) {
        currentResult = {
          startSeason: plot.sowSeason,
          startTimestamp: plot.sowTimestamp,
          startIndex: plot.index,
          endIndex: plot.index + toBigInt(bucketSize, 6),
          avgSownBeansPerPod: 0,
          numPlots: 0
        };
      }
      const addedPods = BigInt_min(currentResult.endIndex, plotEnd) - BigInt_max(currentResult.startIndex, plot.index);
      currentResult.avgSownBeansPerPod += fromBigInt(plot.sownBeansPerPod, 6) * (fromBigInt(addedPods, 6) / bucketSize);
      currentResult.numPlots++;

      applyAPR(plot, addedPods);

      while (plotEnd >= currentResult.endIndex) {
        currentResult.endSeason = plot.sowSeason;
        currentResult.endTimestamp = plot.sowTimestamp;
        results.push(currentResult);

        // The current plot spills over into a new bucket
        if (plotEnd > currentResult.endIndex) {
          const oldBucketEnd = currentResult.endIndex;
          const newBucketEnd = oldBucketEnd + toBigInt(bucketSize, 6);
          const spilloverPods = BigInt_min(newBucketEnd, plotEnd) - oldBucketEnd;
          currentResult = {
            startSeason: plot.sowSeason,
            startTimestamp: plot.sowTimestamp,
            startIndex: oldBucketEnd,
            endIndex: newBucketEnd,
            avgSownBeansPerPod: fromBigInt(plot.sownBeansPerPod, 6) * (fromBigInt(spilloverPods, 6) / bucketSize),
            numPlots: 1
          };
          applyAPR(plot, spilloverPods);
        } else {
          // The current plot ends the bucket
          currentResult = null;
          break;
        }
      }

      // Final plot, incomplete bucket
      if (i === plots.length - 1) {
        currentResult.endIndex = plotEnd;
        currentResult.endSeason = plot.sowSeason;
        currentResult.endTimestamp = plot.sowTimestamp;
        currentResult.avgSownBeansPerPod *=
          bucketSize / fromBigInt(currentResult.endIndex - currentResult.startIndex, 6);
        if (currentResult.avgAPR) {
          currentResult.avgAPR *= bucketSize / fromBigInt(currentResult.endIndex - currentResult.startIndex, 6);
        }
        results.push(currentResult);
      }
    }

    if (CACHEABLE_VALUES.includes(bucketSize)) {
      this.cache[cacheKey] = {
        timestamp: Date.now(),
        result: results
      };
    }
    return results;
  }
}
module.exports = FieldService;
