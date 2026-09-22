import { useMemo } from 'react';
import mappingConfig from '../data/buildingMapping.json';
import { applyBuildingMapping } from '../utils/buildingMapper.js';

/**
 * Resolves the configurable building mapping against the loaded dataset.
 *
 * The mapping config is a plain JSON file (src/data/buildingMapping.json) so
 * it can be hand-edited or replaced with a CMDB export without touching any
 * rendering code. Swap `mappingConfig` for a fetch() here if the mapping
 * should come from an API instead.
 *
 * Returns null until the dataset has loaded.
 */
export function useBuildingMapping(data, config = mappingConfig) {
  return useMemo(() => {
    if (!data || !data.nodes) return null;

    const index = applyBuildingMapping(data.nodes, config, {
      uplinkRoutersBySwitch: data.uplinkRoutersBySwitch,
    });

    // Grouping must never lose a device.
    if (index.stats.mappedCount !== index.stats.switchCount) {
      console.error(
        `Building mapping lost switches: ${index.stats.mappedCount} of ${index.stats.switchCount} mapped.`
      );
    }

    return index;
  }, [data?.nodes, data?.uplinkRoutersBySwitch, config]);
}
