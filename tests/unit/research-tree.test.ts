/**
 * Unit tests for Research Tech Tree
 * Verifies the full technology tree: prerequisite chains, cost scaling, research time,
 * lab level requirements, and tech effects.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import {
  TECH_DEFINITIONS,
  getResearchCost,
  getResearchTime,
  canResearch,
  getTechEffect,
  getEmptyTechLevels,
  completeResearch,
} from '../../worker/src/game/services/researchService';
import { Resources, TechLevels, BuildingLevels } from '../../worker/src/game/types';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createEmptyBuildings(): BuildingLevels {
  return {
    metalMine: 0,
    crystalMine: 0,
    deuteriumMine: 0,
    solarPlant: 0,
    fusionReactor: 0,
    metalStorage: 0,
    crystalStorage: 0,
    deuteriumStorage: 0,
    spaceshipFactory: 0,
    robotFactory: 0,
    researchLab: 0,
    allianceDepot: 0,
    missileSilo: 0,
    radiationStation: 0,
  };
}

function createEmptyTechs(): TechLevels {
  return getEmptyTechLevels();
}

// ============================================================================
// TECH TREE DEFINITION TESTS
// ============================================================================

describe('Tech Tree Structure', () => {
  test('all 15 technologies are defined', () => {
    const techCount = Object.keys(TECH_DEFINITIONS).length;
    expect(techCount).toBe(15);
  });

  test('each tech has required fields', () => {
    Object.values(TECH_DEFINITIONS).forEach((def) => {
      expect(def.id).toBeDefined();
      expect(def.name).toBeDefined();
      expect(def.key).toBeDefined();
      expect(def.baseCost).toBeDefined();
      expect(def.factor).toBeGreaterThan(0);
      expect(def.prerequisites).toBeDefined();
      expect(def.description).toBeDefined();
    });
  });

  test('Energy Technology (113) has no tech prerequisites', () => {
    const def = TECH_DEFINITIONS[113];
    expect(def.prerequisites.techs).toBeUndefined();
    expect(def.prerequisites.buildings).toEqual({ researchLab: 1 });
  });

  test('Laser Technology (120) requires Energy Tech 2', () => {
    const def = TECH_DEFINITIONS[120];
    expect(def.prerequisites.techs?.energyTech).toBe(2);
    expect(def.prerequisites.buildings?.researchLab).toBe(1);
  });

  test('Ion Technology (121) requires Laser Tech 5 + Energy Tech 4', () => {
    const def = TECH_DEFINITIONS[121];
    expect(def.prerequisites.techs?.laserTech).toBe(5);
    expect(def.prerequisites.techs?.energyTech).toBe(4);
  });

  test('Plasma Technology (122) requires Laser 10, Ion 5, Energy 8', () => {
    const def = TECH_DEFINITIONS[122];
    expect(def.prerequisites.techs?.laserTech).toBe(10);
    expect(def.prerequisites.techs?.ionTech).toBe(5);
    expect(def.prerequisites.techs?.energyTech).toBe(8);
  });

  test('Hyperspace Technology (114) requires Energy 5 + Shielding 5', () => {
    const def = TECH_DEFINITIONS[114];
    expect(def.prerequisites.techs?.energyTech).toBe(5);
    expect(def.prerequisites.techs?.shieldingTech).toBe(5);
  });

  test('Combustion Drive (115) requires Energy Tech 1', () => {
    const def = TECH_DEFINITIONS[115];
    expect(def.prerequisites.techs?.energyTech).toBe(1);
  });

  test('Impulse Drive (117) requires Energy Tech 1', () => {
    const def = TECH_DEFINITIONS[117];
    expect(def.prerequisites.techs?.energyTech).toBe(1);
  });

  test('Hyperspace Drive (118) requires Hyperspace Tech 3', () => {
    const def = TECH_DEFINITIONS[118];
    expect(def.prerequisites.techs?.hyperspaceTech).toBe(3);
  });

  test('Graviton Technology (199) requires 300,000 energy production', () => {
    const def = TECH_DEFINITIONS[199];
    expect(def.prerequisites.energyProduction).toBe(300000);
    expect(def.prerequisites.buildings?.researchLab).toBe(12);
  });
});

// ============================================================================
// PREREQUISITE CHECKING
// ============================================================================

describe('Prerequisite Validation', () => {
  let emptyTechs: TechLevels;
  let emptyBuildings: BuildingLevels;

  beforeEach(() => {
    emptyTechs = createEmptyTechs();
    emptyBuildings = createEmptyBuildings();
  });

  test('cannot research tech without Research Lab', () => {
    expect(canResearch(113, emptyTechs, emptyBuildings)).toBe(false);
  });

  test('can research Energy Tech with Lab level 1', () => {
    emptyBuildings.researchLab = 1;
    expect(canResearch(113, emptyTechs, emptyBuildings)).toBe(true);
  });

  test('cannot research Laser Tech without Energy Tech 2', () => {
    emptyBuildings.researchLab = 1;
    expect(canResearch(120, emptyTechs, emptyBuildings)).toBe(false);

    emptyTechs.energyTech = 1;
    expect(canResearch(120, emptyTechs, emptyBuildings)).toBe(false);

    emptyTechs.energyTech = 2;
    expect(canResearch(120, emptyTechs, emptyBuildings)).toBe(true);
  });

  test('cannot research Ion Tech without Laser 5 + Energy 4', () => {
    emptyBuildings.researchLab = 1;

    // Missing both prerequisites
    expect(canResearch(121, emptyTechs, emptyBuildings)).toBe(false);

    // Only Laser Tech
    emptyTechs.laserTech = 5;
    expect(canResearch(121, emptyTechs, emptyBuildings)).toBe(false);

    // Add Energy Tech
    emptyTechs.energyTech = 4;
    expect(canResearch(121, emptyTechs, emptyBuildings)).toBe(true);
  });

  test('cannot research Plasma without full chain', () => {
    emptyBuildings.researchLab = 1;

    // Plasma requires: Laser 10, Ion 5, Energy 8
    expect(canResearch(122, emptyTechs, emptyBuildings)).toBe(false);

    emptyTechs.energyTech = 8;
    expect(canResearch(122, emptyTechs, emptyBuildings)).toBe(false);

    emptyTechs.laserTech = 10;
    expect(canResearch(122, emptyTechs, emptyBuildings)).toBe(false);

    emptyTechs.ionTech = 5;
    expect(canResearch(122, emptyTechs, emptyBuildings)).toBe(true);
  });

  test('cannot research Hyperspace Drive without Hyperspace Tech 3', () => {
    emptyBuildings.researchLab = 1;
    emptyTechs.hyperspaceTech = 2;
    expect(canResearch(118, emptyTechs, emptyBuildings)).toBe(false);

    emptyTechs.hyperspaceTech = 3;
    expect(canResearch(118, emptyTechs, emptyBuildings)).toBe(true);
  });

  test('cannot research Graviton without 300,000 energy production', () => {
    emptyBuildings.researchLab = 12;
    expect(canResearch(199, emptyTechs, emptyBuildings, 299999)).toBe(false);
    expect(canResearch(199, emptyTechs, emptyBuildings, 300000)).toBe(true);
  });

  test('Weapon Tech requires Lab 4', () => {
    emptyBuildings.researchLab = 3;
    expect(canResearch(109, emptyTechs, emptyBuildings)).toBe(false);

    emptyBuildings.researchLab = 4;
    expect(canResearch(109, emptyTechs, emptyBuildings)).toBe(true);
  });

  test('Shielding Tech requires Lab 6 + Energy 3', () => {
    emptyBuildings.researchLab = 6;
    emptyTechs.energyTech = 2;
    expect(canResearch(110, emptyTechs, emptyBuildings)).toBe(false);

    emptyTechs.energyTech = 3;
    expect(canResearch(110, emptyTechs, emptyBuildings)).toBe(true);
  });

  test('Armor Tech requires Lab 2 (no tech prerequisites)', () => {
    emptyBuildings.researchLab = 1;
    expect(canResearch(111, emptyTechs, emptyBuildings)).toBe(false);

    emptyBuildings.researchLab = 2;
    expect(canResearch(111, emptyTechs, emptyBuildings)).toBe(true);
  });

  test('Espionage Tech requires Lab 3', () => {
    emptyBuildings.researchLab = 2;
    expect(canResearch(106, emptyTechs, emptyBuildings)).toBe(false);

    emptyBuildings.researchLab = 3;
    expect(canResearch(106, emptyTechs, emptyBuildings)).toBe(true);
  });

  test('Computer Tech requires Lab 1 (no tech prerequisites)', () => {
    emptyBuildings.researchLab = 1;
    expect(canResearch(108, emptyTechs, emptyBuildings)).toBe(true);
  });

  test('Astrophysics requires Lab 1 + Espionage 4 + Impulse 3', () => {
    emptyBuildings.researchLab = 1;
    emptyTechs.espionageTech = 4;
    emptyTechs.impulseDrive = 3;
    expect(canResearch(124, emptyTechs, emptyBuildings)).toBe(true);
  });
});

// ============================================================================
// COST SCALING
// ============================================================================

describe('Research Cost Scaling', () => {
  test('cost formula: base × factor^(level - 1)', () => {
    // Energy Tech: base = 800c + 400d, factor = 2.0
    const cost1 = getResearchCost(113, 1);
    expect(cost1).toEqual({ metal: 0, crystal: 800, deuterium: 400 });

    const cost2 = getResearchCost(113, 2);
    expect(cost2).toEqual({ metal: 0, crystal: 1600, deuterium: 800 });

    const cost3 = getResearchCost(113, 3);
    expect(cost3).toEqual({ metal: 0, crystal: 3200, deuterium: 1600 });
  });

  test('cost scales exponentially for factor 2.0', () => {
    const cost1 = getResearchCost(113, 1);
    const cost2 = getResearchCost(113, 2);
    const cost3 = getResearchCost(113, 3);
    const cost4 = getResearchCost(113, 4);

    expect(cost2.crystal).toBe(cost1.crystal * 2);
    expect(cost3.crystal).toBe(cost1.crystal * 4);
    expect(cost4.crystal).toBe(cost1.crystal * 8);
  });

  test('cost scales with factor 1.75 for Astrophysics', () => {
    // Astrophysics: base = 4000m + 8000c + 4000d, factor = 1.75
    const cost1 = getResearchCost(124, 1);
    expect(cost1.metal).toBe(4000);
    expect(cost1.crystal).toBe(8000);
    expect(cost1.deuterium).toBe(4000);

    const cost2 = getResearchCost(124, 2);
    expect(cost2.metal).toBe(Math.floor(4000 * 1.75));
    expect(cost2.crystal).toBe(Math.floor(8000 * 1.75));
    expect(cost2.deuterium).toBe(Math.floor(4000 * 1.75));
  });

  test('Graviton Tech level 1 has zero resource cost', () => {
    const cost1 = getResearchCost(199, 1);
    expect(cost1).toEqual({ metal: 0, crystal: 0, deuterium: 0 });

    // Level 2 uses factor 3.0 but base is still 0
    const cost2 = getResearchCost(199, 2);
    expect(cost2).toEqual({ metal: 0, crystal: 0, deuterium: 0 });
  });

  test('all costs are integers (floored)', () => {
    for (let techId = 106; techId <= 199; techId++) {
      const def = TECH_DEFINITIONS[techId];
      if (!def) continue;

      for (let level = 1; level <= 5; level++) {
        const cost = getResearchCost(techId, level);
        expect(Number.isInteger(cost.metal)).toBe(true);
        expect(Number.isInteger(cost.crystal)).toBe(true);
        expect(Number.isInteger(cost.deuterium)).toBe(true);
      }
    }
  });

  test('Laser Tech level 5 cost is reasonable', () => {
    // Laser: base = 200m + 100c, factor = 2.0
    const cost5 = getResearchCost(120, 5);
    expect(cost5.metal).toBe(Math.floor(200 * 16)); // 2^4 = 16
    expect(cost5.crystal).toBe(Math.floor(100 * 16));
    expect(cost5.deuterium).toBe(0);
  });
});

// ============================================================================
// RESEARCH TIME CALCULATION
// ============================================================================

describe('Research Time Calculation', () => {
  test('time formula: (metal + crystal) / (1000 × (1 + labLevel) × universeSpeed)', () => {
    // Energy Tech level 1: cost = 0m + 800c = 800
    // Lab 1, speed 1: time = 800 / (1000 × 2 × 1) = 0.4 => 1 second (minimum)
    const time1 = getResearchTime(113, 1, 1, 1);
    expect(time1).toBe(1);

    // Lab 10, speed 1: time = 800 / (1000 × 11 × 1) = ~0.07 => 1 second (minimum)
    const time2 = getResearchTime(113, 1, 10, 1);
    expect(time2).toBe(1);
  });

  test('higher lab levels reduce research time', () => {
    // Hyperspace Drive level 2: cost = (10000m + 20000c) × 2 = 60000
    // Lab 1: 60000 / (1000 × 2 × 1) = 30 seconds
    const time1 = getResearchTime(118, 2, 1, 1);
    expect(time1).toBeGreaterThan(20);

    // Lab 10: 60000 / (1000 × 11 × 1) = ~5.4 seconds
    const time2 = getResearchTime(118, 2, 10, 1);
    expect(time2).toBeLessThan(time1);
  });

  test('universe speed affects research time proportionally', () => {
    // Plasma level 3: cost = (2000m + 4000c) × 4 = 24,000
    const time1x = getResearchTime(122, 3, 5, 1);
    const time2x = getResearchTime(122, 3, 5, 2);

    // 2x speed should be approximately 2x faster
    expect(time2x).toBeLessThan(time1x);
    expect(time2x * 2).toBeGreaterThanOrEqual(time1x);
  });

  test('higher research levels with expensive techs cost more time', () => {
    // Use Hyperspace Drive which has high costs
    const time1 = getResearchTime(118, 1, 5, 1);
    const time2 = getResearchTime(118, 2, 5, 1);
    const time3 = getResearchTime(118, 3, 5, 1);

    // Cost doubles each level for factor 2.0, so time should roughly double
    expect(time2).toBeGreaterThan(time1);
    expect(time3).toBeGreaterThan(time2);
  });

  test('Graviton Tech level 1 has 1 second research time (no cost)', () => {
    const time = getResearchTime(199, 1, 12, 1);
    expect(time).toBe(1);
  });

  test('expensive techs take significant time', () => {
    // Hyperspace Drive level 2: base = 10000m + 20000c, level 2 = ×2 = 60000
    const time = getResearchTime(118, 2, 1, 1);
    expect(time).toBeGreaterThan(20);
  });

  test('research time is always at least 1 second', () => {
    // Test with minimal cost, high lab, high speed
    const time = getResearchTime(113, 1, 100, 10);
    expect(time).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// LAB LEVEL REQUIREMENTS
// ============================================================================

describe('Lab Level Requirements', () => {
  test('Energy Tech requires Lab 1', () => {
    expect(TECH_DEFINITIONS[113].prerequisites.buildings?.researchLab).toBe(1);
  });

  test('Armor Tech requires Lab 2', () => {
    expect(TECH_DEFINITIONS[111].prerequisites.buildings?.researchLab).toBe(2);
  });

  test('Espionage Tech requires Lab 3', () => {
    expect(TECH_DEFINITIONS[106].prerequisites.buildings?.researchLab).toBe(3);
  });

  test('Weapon Tech requires Lab 4', () => {
    expect(TECH_DEFINITIONS[109].prerequisites.buildings?.researchLab).toBe(4);
  });

  test('Shielding Tech requires Lab 6', () => {
    expect(TECH_DEFINITIONS[110].prerequisites.buildings?.researchLab).toBe(6);
  });

  test('Graviton Tech requires Lab 12', () => {
    expect(TECH_DEFINITIONS[199].prerequisites.buildings?.researchLab).toBe(12);
  });
});

// ============================================================================
// TECH EFFECTS
// ============================================================================

describe('Technology Effects', () => {
  test('Weapon Tech at level 1 gives +10% attack', () => {
    const effect = getTechEffect(109, 1);
    expect(effect?.effects[0].type).toBe('weapon_bonus');
    expect(effect?.effects[0].value).toBe(1.1);
  });

  test('Shielding Tech at level 5 gives +50% shield', () => {
    const effect = getTechEffect(110, 5);
    expect(effect?.effects[0].type).toBe('shield_bonus');
    expect(effect?.effects[0].value).toBe(1.5);
  });

  test('Armor Tech at level 10 gives +100% hull', () => {
    const effect = getTechEffect(111, 10);
    expect(effect?.effects[0].type).toBe('armor_bonus');
    expect(effect?.effects[0].value).toBe(2.0);
  });

  test('Combustion Drive at level 3 gives +30% speed', () => {
    const effect = getTechEffect(115, 3);
    expect(effect?.effects[0].type).toBe('speed_bonus');
    expect(effect?.effects[0].value).toBe(1.3);
  });

  test('Impulse Drive at level 2 gives +40% speed', () => {
    const effect = getTechEffect(117, 2);
    expect(effect?.effects[0].type).toBe('speed_bonus');
    expect(effect?.effects[0].value).toBe(1.4);
  });

  test('Hyperspace Drive at level 1 gives +30% speed', () => {
    const effect = getTechEffect(118, 1);
    expect(effect?.effects[0].type).toBe('speed_bonus');
    expect(effect?.effects[0].value).toBe(1.3);
  });
});

// ============================================================================
// TECH COMPLETION
// ============================================================================

describe('Tech Completion', () => {
  test('completing a tech increments its level', () => {
    let techs = createEmptyTechs();
    expect(techs.energyTech).toBe(0);

    techs = completeResearch(113, techs);
    expect(techs.energyTech).toBe(1);

    techs = completeResearch(113, techs);
    expect(techs.energyTech).toBe(2);
  });

  test('completing a tech does not affect others', () => {
    let techs = createEmptyTechs();
    techs.laserTech = 5;

    techs = completeResearch(113, techs);
    expect(techs.energyTech).toBe(1);
    expect(techs.laserTech).toBe(5);
  });

  test('completing all 15 techs works independently', () => {
    const allTechIds = Object.keys(TECH_DEFINITIONS).map(Number);
    let techs = createEmptyTechs();

    allTechIds.forEach((id) => {
      const def = TECH_DEFINITIONS[id];
      techs = completeResearch(id, techs);
      expect(techs[def.key as keyof TechLevels]).toBe(1);
    });

    // All 15 should be at level 1
    expect(techs.energyTech).toBe(1);
    expect(techs.laserTech).toBe(1);
    expect(techs.ionTech).toBe(1);
    expect(techs.hyperspaceTech).toBe(1);
    expect(techs.plasmaTech).toBe(1);
    expect(techs.combustionDrive).toBe(1);
    expect(techs.impulseDrive).toBe(1);
    expect(techs.hyperspaceDrive).toBe(1);
    expect(techs.espionageTech).toBe(1);
    expect(techs.computerTech).toBe(1);
    expect(techs.astrophysics).toBe(1);
    expect(techs.weaponTech).toBe(1);
    expect(techs.shieldingTech).toBe(1);
    expect(techs.armorTech).toBe(1);
    expect(techs.gravitonTech).toBe(1);
  });
});

// ============================================================================
// INTEGRATION: FULL TECH TREE PREREQUISITE CHAINS
// ============================================================================

describe('Full Tech Tree Prerequisite Chains', () => {
  test('can research entire propulsion line: Energy -> Combustion/Impulse -> Hyperspace', () => {
    let techs = createEmptyTechs();
    const buildings = createEmptyBuildings();
    buildings.researchLab = 10; // High lab level to be safe

    // Step 1: Research Energy Tech to level 1
    expect(canResearch(113, techs, buildings)).toBe(true);
    techs = completeResearch(113, techs);
    expect(techs.energyTech).toBe(1);

    // Step 2: Can now research Combustion Drive
    expect(canResearch(115, techs, buildings)).toBe(true);
    techs = completeResearch(115, techs);
    expect(techs.combustionDrive).toBe(1);

    // Step 3: Can research Impulse Drive
    expect(canResearch(117, techs, buildings)).toBe(true);
    techs = completeResearch(117, techs);
    expect(techs.impulseDrive).toBe(1);

    // Step 4: Research Shielding Tech for Hyperspace
    techs.shieldingTech = 5;
    techs.energyTech = 5;
    expect(canResearch(114, techs, buildings)).toBe(true);
    techs = completeResearch(114, techs);
    expect(techs.hyperspaceTech).toBe(1);

    // Step 5: Can now research Hyperspace Drive
    techs.hyperspaceTech = 3;
    expect(canResearch(118, techs, buildings)).toBe(true);
  });

  test('can research entire weapon line: Energy -> Laser -> Ion -> Plasma', () => {
    let techs = createEmptyTechs();
    const buildings = createEmptyBuildings();
    buildings.researchLab = 10;

    // Energy to 2
    techs.energyTech = 2;
    expect(canResearch(120, techs, buildings)).toBe(true);
    techs = completeResearch(120, techs);
    expect(techs.laserTech).toBe(1);

    // Laser to 5
    techs.laserTech = 5;
    techs.energyTech = 4;
    expect(canResearch(121, techs, buildings)).toBe(true);
    techs = completeResearch(121, techs);
    expect(techs.ionTech).toBe(1);

    // Full Plasma requirements
    techs.laserTech = 10;
    techs.ionTech = 5;
    techs.energyTech = 8;
    expect(canResearch(122, techs, buildings)).toBe(true);
    techs = completeResearch(122, techs);
    expect(techs.plasmaTech).toBe(1);
  });

  test('can research exploration line: Computer -> Espionage -> Astrophysics', () => {
    let techs = createEmptyTechs();
    const buildings = createEmptyBuildings();
    buildings.researchLab = 10;

    // Computer Tech
    expect(canResearch(108, techs, buildings)).toBe(true);
    techs = completeResearch(108, techs);
    expect(techs.computerTech).toBe(1);

    // Espionage Tech requires Lab 3
    buildings.researchLab = 3;
    expect(canResearch(106, techs, buildings)).toBe(true);
    techs = completeResearch(106, techs);
    expect(techs.espionageTech).toBe(1);

    // Astrophysics requires Espionage 4 + Impulse 3
    techs.espionageTech = 4;
    techs.impulseDrive = 3;
    expect(canResearch(124, techs, buildings)).toBe(true);
    techs = completeResearch(124, techs);
    expect(techs.astrophysics).toBe(1);
  });

  test('defense techs are independent', () => {
    let techs = createEmptyTechs();
    const buildings = createEmptyBuildings();
    buildings.researchLab = 6;

    // Weapon Tech (requires Lab 4)
    buildings.researchLab = 4;
    expect(canResearch(109, techs, buildings)).toBe(true);
    techs = completeResearch(109, techs);

    // Armor Tech (requires Lab 2)
    buildings.researchLab = 2;
    expect(canResearch(111, techs, buildings)).toBe(true);
    techs = completeResearch(111, techs);

    // Shielding Tech (requires Lab 6 + Energy 3)
    buildings.researchLab = 6;
    techs.energyTech = 3;
    expect(canResearch(110, techs, buildings)).toBe(true);
    techs = completeResearch(110, techs);

    // All three should be researchable independently
    expect(techs.weaponTech).toBe(1);
    expect(techs.armorTech).toBe(1);
    expect(techs.shieldingTech).toBe(1);
  });
});
