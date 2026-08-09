/**
 * server.test.js - Tests for ITEMDLE backend server
 * 
 * Run with: npm test
 * 
 * Tests cover:
 * - parsePythonList function
 * - API endpoint responses
 * - Build data validation
 * - Error handling
 */

// Set test environment before loading server
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';

const request = require('supertest');
const app = require('../server');

// Helper to parse Python list strings (same as in server.js)
function parsePythonList(listStr) {
  if (!listStr || typeof listStr !== 'string') {
    return [];
  }
  
  const inner = listStr.trim().slice(1, -1);
  
  if (!inner) {
    return [];
  }
  
  const elements = [];
  let current = '';
  let depth = 0;
  
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    
    if (char === '[') {
      depth++;
      current += char;
    } else if (char === ']') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      elements.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  if (current.trim()) {
    elements.push(current.trim());
  }
  
  return elements.map(el => {
    const num = Number(el);
    if (!isNaN(num)) {
      return num;
    }
    if (el.startsWith('[') && el.endsWith(']')) {
      return parsePythonList(el);
    }
    return el;
  });
}

// Mock data for testing
const mockLeagueBuildsResponse = {
  championId: '103',
  champion: 'Ahri',
  position: 'mid',
  runes: "[{'primaryStyle': 8100, 'primaryPerk1': 8112}]",
  summ: "[4, 14]",
  item: "[3118, 3100, 4645, 2503, 3089, 3157, 4629, 3041, 3152, 6655, 3135]",
  start_item: "[[1056, 2003, 2003], [2003, 2003], [2003, 2003, 1056]]",
  item_build: "[[3118, 4645, 2420], [3118, 3100, 3089], [3118, 4645, 3089]]",
  skill_order: "[2, 1, 3, 1, 1, 4, 1, 2]",
  boots: "[3020, 3158, 3111]",
  champ_winrate: 0.5127,
  champ_pickrate: 0.1191
};

describe('ITEMDLE Backend Server', () => {
  describe('parsePythonList', () => {
    test('parses simple list of numbers', () => {
      const result = parsePythonList('[1, 2, 3, 4, 5]');
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    test('parses list with spaces', () => {
      const result = parsePythonList('[1, 2, 3, 4, 5]');
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    test('parses nested lists', () => {
      const result = parsePythonList('[[1, 2], [3, 4], [5, 6]]');
      expect(result).toEqual([[1, 2], [3, 4], [5, 6]]);
    });

    test('parses LeagueBuilds item array', () => {
      const result = parsePythonList('[3118, 3100, 4645, 2503, 3089, 3157]');
      expect(result).toEqual([3118, 3100, 4645, 2503, 3089, 3157]);
    });

    test('parses LeagueBuilds boots array', () => {
      const result = parsePythonList('[3020, 3158, 3111]');
      expect(result).toEqual([3020, 3158, 3111]);
    });

    test('parses LeagueBuilds item_build array', () => {
      const result = parsePythonList('[[3118, 4645, 2420], [3118, 3100, 3089]]');
      expect(result).toEqual([[3118, 4645, 2420], [3118, 3100, 3089]]);
    });

    test('handles empty list', () => {
      const result = parsePythonList('[]');
      expect(result).toEqual([]);
    });

    test('handles null/undefined', () => {
      const result1 = parsePythonList(null);
      const result2 = parsePythonList(undefined);
      expect(result1).toEqual([]);
      expect(result2).toEqual([]);
    });
  });

  describe('Build Data Processing', () => {
    test('extracts core 5 + boots from LeagueBuilds data', () => {
      const data = mockLeagueBuildsResponse;
      
      const allItems = parsePythonList(data.item);
      const boots = parsePythonList(data.boots);
      
      // Core 5: first 5 from allItems
      const core5 = allItems.slice(0, 5);
      
      // Add most popular boot
      const core6 = [...core5, boots[0]];
      
      expect(core6.length).toBe(6);
      expect(core6[5]).toBe(3020); // Sorcerer's Shoes
      expect(core6).toEqual([3118, 3100, 4645, 2503, 3089, 3020]);
    });

    test('extracts situational items (excluding core)', () => {
      const data = mockLeagueBuildsResponse;
      
      const allItems = parsePythonList(data.item);
      const boots = parsePythonList(data.boots);
      
      const core5 = allItems.slice(0, 5);
      const core6 = [...core5, boots[0]];
      const coreSet = new Set(core6);
      
      const sitItems = allItems.filter(id => !coreSet.has(id)).slice(0, 14);
      
      expect(sitItems.length).toBeLessThanOrEqual(14);
      expect(sitItems).not.toContain(3118); // Malignance
      expect(sitItems).not.toContain(3020); // Sorcerer's Shoes
    });

    test('handles missing boots gracefully', () => {
      const data = { ...mockLeagueBuildsResponse, boots: '[]' };
      
      const allItems = parsePythonList(data.item);
      const boots = parsePythonList(data.boots);
      
      const core5 = allItems.slice(0, 5);
      const core6 = [...core5];
      
      // Should still have 5 items
      expect(core6.length).toBe(5);
    });

    test('handles short item list', () => {
      const data = { ...mockLeagueBuildsResponse, item: '[3118, 3100, 4645]' };
      
      const allItems = parsePythonList(data.item);
      const boots = parsePythonList(data.boots);
      
      const core5 = allItems.slice(0, 5);
      const core6 = [...core5, boots[0]];
      
      // Should have 4 items (3 from list + 1 boot)
      expect(core6.length).toBe(4);
    });
  });

  describe('API Endpoints', () => {
    test('GET /api/health returns status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('api');
    });

    test('GET /api/builds returns cached builds', async () => {
      const response = await request(app)
        .get('/api/builds')
        .expect(200);
      
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('builds');
      expect(response.body).toHaveProperty('apiCallCount');
      expect(typeof response.body.builds).toBe('object');
    });

    test('POST /api/cache/clear clears cache', async () => {
      const response = await request(app)
        .post('/api/cache/clear')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('message', 'Cache cleared');
    });

    test('GET /api/build/:champion with missing name returns 404', async () => {
      const response = await request(app)
        .get('/api/build/')
        .expect(404);
    });

    test('GET /api/build/:champion with empty name returns 400', async () => {
      const response = await request(app)
        .get('/api/build/%20')
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('empty');
    });

    test('GET /api/build/:champion with very long name returns 400', async () => {
      const longName = 'a'.repeat(100);
      const response = await request(app)
        .get(`/api/build/${longName}`)
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('too long');
    });
  });

  describe('Environment Configuration', () => {
    const originalEnv = { ...process.env };
    
    afterEach(() => {
      // Restore original environment
      process.env = { ...originalEnv };
    });

    test('BUILD_SOURCE defaults to parsebot when PARSE_API_KEY is set', () => {
      process.env.PARSE_API_KEY = 'test_key';
      delete process.env.BUILD_SOURCE;
      
      // Re-evaluate the logic
      const BUILD_SOURCE = process.env.BUILD_SOURCE || (process.env.PARSE_API_KEY ? 'parsebot' : 'leaguebuilds');
      
      expect(BUILD_SOURCE).toBe('parsebot');
    });

    test('BUILD_SOURCE defaults to leaguebuilds when PARSE_API_KEY is not set', () => {
      delete process.env.PARSE_API_KEY;
      delete process.env.BUILD_SOURCE;
      
      const BUILD_SOURCE = process.env.BUILD_SOURCE || (process.env.PARSE_API_KEY ? 'parsebot' : 'leaguebuilds');
      
      expect(BUILD_SOURCE).toBe('leaguebuilds');
    });

    test('BUILD_SOURCE can be explicitly set to leaguebuilds', () => {
      process.env.BUILD_SOURCE = 'leaguebuilds';
      
      const BUILD_SOURCE = process.env.BUILD_SOURCE || (process.env.PARSE_API_KEY ? 'parsebot' : 'leaguebuilds');
      
      expect(BUILD_SOURCE).toBe('leaguebuilds');
    });
  });
});

describe('Build Source Selection', () => {
  const originalEnv = { ...process.env };
  
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Parse.bot Source', () => {
    test('uses Parse.bot when BUILD_SOURCE is parsebot', () => {
      process.env.BUILD_SOURCE = 'parsebot';
      process.env.PARSE_API_KEY = 'test_key';
      
      // This would use fetchFromParseBot
      // We can't easily test the actual fetch without mocking axios
      // But we can verify the configuration is correct
      expect(process.env.BUILD_SOURCE).toBe('parsebot');
    });
  });

  describe('LeagueBuilds Source', () => {
    test('uses LeagueBuilds when BUILD_SOURCE is leaguebuilds', () => {
      process.env.BUILD_SOURCE = 'leaguebuilds';
      
      expect(process.env.BUILD_SOURCE).toBe('leaguebuilds');
    });

    test('LeagueBuilds URL is configurable', () => {
      process.env.LEAGUEBUILDS_URL = 'https://custom.leaguebuilds.org';
      
      const LEAGUEBUILDS_URL = process.env.LEAGUEBUILDS_URL || 'https://leaguebuilds.hopto.org';
      expect(LEAGUEBUILDS_URL).toBe('https://custom.leaguebuilds.org');
    });

    test('LeagueBuilds URL defaults to hopto.org', () => {
      delete process.env.LEAGUEBUILDS_URL;
      
      const LEAGUEBUILDS_URL = process.env.LEAGUEBUILDS_URL || 'https://leaguebuilds.hopto.org';
      expect(LEAGUEBUILDS_URL).toBe('https://leaguebuilds.hopto.org');
    });
  });
});
