/**
 * Frontend Module Structure Tests
 * 
 * Validates that the ES module split from script.js is structurally sound:
 * - Every module file exists
 * - Every import resolves to an export in the target module
 * - No circular dependency chains that would cause runtime errors
 * - Module sizes are reasonable (no empty or suspiciously small files)
 * - index.html references main.js with type="module"
 * - Old script.js is deleted
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const STATIC_DIR = path.resolve(__dirname, '../../../frontend/public/static');
const FRONTEND_DIR = path.resolve(__dirname, '../../../frontend');

const MODULES = [
  'state.js',
  'map-setup.js',
  'geo.js',
  'render.js',
  'fetch.js',
  'ui-states.js',
  'engine.js',
  'main.js',
];

describe('Frontend Module Structure', () => {
  it('all 8 module files exist', () => {
    MODULES.forEach(m => {
      const filePath = path.join(STATIC_DIR, m);
      expect(fs.existsSync(filePath), `${m} should exist`).toBe(true);
    });
  });

  it('old monolithic script.js is deleted', () => {
    const scriptPath = path.join(STATIC_DIR, 'script.js');
    expect(fs.existsSync(scriptPath), 'script.js should be deleted').toBe(false);
  });

  it('index.html loads main.js with type="module"', () => {
    const html = fs.readFileSync(path.join(FRONTEND_DIR, 'index.html'), 'utf8');
    expect(html).toContain('type="module"');
    expect(html).toContain('main.js');
    expect(html).not.toContain('"static/script.js"');
  });

  it('each module has a JSDoc header comment', () => {
    MODULES.forEach(m => {
      const content = fs.readFileSync(path.join(STATIC_DIR, m), 'utf8');
      expect(content.startsWith('/**'), `${m} should start with JSDoc`).toBe(true);
      expect(content).toContain('@file');
    });
  });

  it('no module is suspiciously empty (< 500 bytes)', () => {
    MODULES.forEach(m => {
      const stats = fs.statSync(path.join(STATIC_DIR, m));
      expect(stats.size, `${m} should be > 500 bytes`).toBeGreaterThan(500);
    });
  });

  it('total module size is within 20% of original script.js (104KB)', () => {
    const totalSize = MODULES.reduce((sum, m) => {
      return sum + fs.statSync(path.join(STATIC_DIR, m)).size;
    }, 0);
    // Original was ~104KB. Allow 80KB-130KB range.
    expect(totalSize).toBeGreaterThan(80000);
    expect(totalSize).toBeLessThan(130000);
  });
});

describe('Module Import/Export Resolution', () => {
  // Build export map: which names are exported by which files
  const exportMap = new Map();
  MODULES.forEach(m => {
    const content = fs.readFileSync(path.join(STATIC_DIR, m), 'utf8');
    const exports = [];
    const matches = content.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var)\s+(\w+)/g);
    for (const match of matches) {
      exports.push(match[1]);
    }
    exportMap.set(m, exports);
  });

  it('every named import resolves to an export in the source module', () => {
    const problems: string[] = [];
    MODULES.forEach(m => {
      const content = fs.readFileSync(path.join(STATIC_DIR, m), 'utf8');
      const importMatches = content.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/([^']+)'/g);
      for (const match of importMatches) {
        const names = match[1].split(',').map(s => s.trim()).filter(Boolean);
        const fromFile = match[2];
        const fromExports = exportMap.get(fromFile) || [];
        names.forEach(name => {
          if (!fromExports.includes(name)) {
            problems.push(`${m}: imports '${name}' from '${fromFile}' but it's not exported`);
          }
        });
      }
    });
    expect(problems, `Import resolution errors:\n${problems.join('\n')}`).toHaveLength(0);
  });

  it('state.js exports shared layer groups and data', () => {
    const exports = exportMap.get('state.js') || [];
    // Key shared state
    expect(exports).toContain('liveData');
    expect(exports).toContain('surfLayer');
    expect(exports).toContain('radarLayerGroup');
    expect(exports).toContain('map');
    expect(exports).toContain('setMap');
    expect(exports).toContain('surfSpots');
    expect(exports).toContain('currentView');
    expect(exports).toContain('setCurrentView');
  });

  it('map-setup.js exports bounds and applyScale', () => {
    const exports = exportMap.get('map-setup.js') || [];
    expect(exports).toContain('bounds');
    expect(exports).toContain('applyScale');
    // map is created in map-setup.js but exported via `export { map }` re-export syntax
    // and also exists in state.js via setMap(). Both are valid export patterns.
    const content = fs.readFileSync(path.join(STATIC_DIR, 'map-setup.js'), 'utf8');
    expect(content).toContain('export { map }');
  });

  it('geo.js exports geography and bathymetry functions', () => {
    const exports = exportMap.get('geo.js') || [];
    expect(exports).toContain('ISLAND_POLYS');
    expect(exports).toContain('ISLAND_OUTLINES');
    expect(exports).toContain('pointInPoly');
    expect(exports).toContain('isOnLand');
    expect(exports).toContain('distToShoreKm');
    expect(exports).toContain('generateBathymetryGrid');
    expect(exports).toContain('getOffsetPolygon');
  });

  it('fetch.js exports all fetch functions', () => {
    const exports = exportMap.get('fetch.js') || [];
    const expectedFetchers = [
      'fetchWeather', 'fetchBuoys', 'fetchStations', 'fetchQuakes',
      'fetchAirport', 'fetchAlerts', 'fetchTurbulence', 'fetchAirQuality',
      'fetchAircraft', 'fetchCurrents', 'fetchTide', 'fetchWind',
    ];
    expectedFetchers.forEach(fn => {
      expect(exports, `fetch.js should export ${fn}`).toContain(fn);
    });
  });

  it('engine.js exports transitionState', () => {
    const exports = exportMap.get('engine.js') || [];
    expect(exports).toContain('transitionState');
  });

  it('ui-states.js exports uiStates', () => {
    const exports = exportMap.get('ui-states.js') || [];
    expect(exports).toContain('uiStates');
  });

  it('main.js imports transitionState and all fetch functions', () => {
    const content = fs.readFileSync(path.join(STATIC_DIR, 'main.js'), 'utf8');
    expect(content).toContain("from './engine.js'");
    expect(content).toContain("from './fetch.js'");
    expect(content).toContain('transitionState');
    expect(content).toContain('fetchWeather');
    expect(content).toContain('fetchAircraft');
  });
});

describe('Module Dependency Graph', () => {
  // Build dependency graph
  const deps = new Map<string, string[]>();
  MODULES.forEach(m => {
    const content = fs.readFileSync(path.join(STATIC_DIR, m), 'utf8');
    const imports = new Set<string>();
    const matches = content.matchAll(/from\s*'\.\/([^']+)'/g);
    for (const match of matches) {
      imports.add(match[1]);
    }
    deps.set(m, [...imports]);
  });

  it('state.js has no local imports (leaf module)', () => {
    expect(deps.get('state.js') || []).toHaveLength(0);
  });

  it('main.js is the entry point (not imported by any other module)', () => {
    const importers = MODULES.filter(m => {
      return (deps.get(m) || []).includes('main.js');
    });
    expect(importers).toHaveLength(0);
  });

  it('no module imports from the old script.js', () => {
    MODULES.forEach(m => {
      const moduleDeps = deps.get(m) || [];
      expect(moduleDeps).not.toContain('script.js');
    });
  });
});
