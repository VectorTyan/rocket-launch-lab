import { ROCKETS, SOURCES, getSitesForRocket } from '../fleet-data.js';
import { STUDIO_THEMES, getStudioTheme } from '../studio-themes.js';
import { escapeHtml } from './formatters.js';

function displayRecord(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      typeof value === 'string' ? escapeHtml(value) : value,
    ]),
  );
}

/** No DOM, storage, mutable app state or renderer is needed to build the shell. */
export function createShellContext({ rocket, modules, mission, site, studioThemeId } = {}) {
  if (
    !rocket?.id ||
    !Array.isArray(modules) ||
    !mission ||
    !Array.isArray(mission.events) ||
    !Number.isFinite(mission.duration) ||
    mission.duration <= -10
  ) {
    throw new TypeError('The app shell requires rocket, modules and mission data.');
  }
  if (!ROCKETS.some((entry) => entry.id === rocket.id)) throw new RangeError('Unknown shell rocket.');
  const sites = getSitesForRocket(rocket.id);
  const selectedSite = sites.find((entry) => entry.id === site?.id) ?? sites[0];
  return {
    rocket: displayRecord(rocket),
    rocketOptions: ROCKETS.map(displayRecord),
    modules: modules.map(displayRecord),
    mission: { ...displayRecord(mission), events: mission.events.map(displayRecord) },
    site: displayRecord(selectedSite),
    sites: sites.map(displayRecord),
    themes: STUDIO_THEMES.map(displayRecord),
    studioThemeId: getStudioTheme(studioThemeId).id,
    sources: SOURCES.filter(
      (source) =>
        rocket.sourceIds.includes(source.id) ||
        ['wenchang-pads', 'jiuquan-pad', 'maps-urls'].includes(source.id),
    ).map(displayRecord),
  };
}
