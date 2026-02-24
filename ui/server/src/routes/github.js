const express = require('express');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const AdmZip = require('adm-zip');
const { getDb, saveDb } = require('../database/init');
const { encryptConfig } = require('../crypto');

const router = express.Router();

// Max downloaded zip size (50MB)
const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024;

// GitHub owner/repo must be alphanumeric + hyphens + dots + underscores
const GITHUB_NAME_RE = /^[a-zA-Z0-9._-]+$/;

// ---- Helpers ----

function httpsGet(url, headers = {}, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    const reqHeaders = {
      'User-Agent': 'tap-config-builder/1.0',
      'Accept': 'application/vnd.github.v3+json',
      ...headers,
    };
    https.get(url, { headers: reqHeaders }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects <= 0) {
          return reject(new Error('Too many redirects'));
        }
        return httpsGet(res.headers.location, headers, maxRedirects - 1).then(resolve).catch(reject);
      }
      const chunks = [];
      let totalSize = 0;
      res.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_DOWNLOAD_SIZE) {
          res.destroy();
          return reject(new Error('Response too large'));
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
        } else {
          resolve({ body, headers: res.headers, statusCode: res.statusCode });
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Extract auth headers from request. Accepts token in:
 *   - Request body (POST): body.token
 *   - Request header: X-GitHub-Token
 * Never from query string (prevents token leaking in logs/referrer).
 */
function getGithubAuthHeaders(req) {
  const headers = {};
  const token = req.body?.token || req.get('X-GitHub-Token');
  if (token && typeof token === 'string' && token.length < 256) {
    headers['Authorization'] = `token ${token}`;
  }
  return headers;
}

function parseGithubUrl(url) {
  const cleaned = url.replace(/\/+$/, '').replace(/\.git$/, '');
  const githubMatch = cleaned.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?/);
  if (githubMatch) {
    return { owner: githubMatch[1], repo: githubMatch[2], branch: githubMatch[3] || null };
  }
  const shortMatch = cleaned.match(/^([^/]+)\/([^/]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2], branch: null };
  }
  return null;
}

function validateParsedUrl(parsed) {
  if (!parsed) return 'Invalid GitHub URL. Use format: owner/repo or https://github.com/owner/repo';
  if (!GITHUB_NAME_RE.test(parsed.owner)) return 'Invalid GitHub owner name';
  if (!GITHUB_NAME_RE.test(parsed.repo)) return 'Invalid GitHub repo name';
  if (parsed.owner.length > 100 || parsed.repo.length > 100) return 'Owner/repo name too long';
  return null;
}

// ---- Routes ----

// GET /api/github/search?q=tap-rest-api
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q || 'tap-';
    const org = req.query.org || 'singer-io';

    // Validate query length
    if (query.length > 200) {
      return res.status(400).json({ error: 'Search query too long' });
    }

    let apiUrl;
    if (org) {
      apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+org:${encodeURIComponent(org)}&sort=stars&order=desc&per_page=30`;
    } else {
      apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+topic:singer-tap&sort=stars&order=desc&per_page=30`;
    }

    const headers = getGithubAuthHeaders(req);

    const { body } = await httpsGet(apiUrl, headers);
    const data = JSON.parse(body.toString());

    const results = (data.items || []).map(repo => ({
      full_name: repo.full_name,
      name: repo.name,
      description: repo.description,
      html_url: repo.html_url,
      stars: repo.stargazers_count,
      language: repo.language,
      updated_at: repo.updated_at,
      default_branch: repo.default_branch,
    }));

    res.json({ total: data.total_count, results });
  } catch (err) {
    console.error('GitHub search error:', err.message);
    res.status(500).json({ error: 'Failed to search GitHub' });
  }
});

// GET /api/github/repo-info?url=https://github.com/singer-io/tap-github
router.get('/repo-info', async (req, res) => {
  try {
    const parsed = parseGithubUrl(req.query.url || '');
    const validationErr = validateParsedUrl(parsed);
    if (validationErr) {
      return res.status(400).json({ error: validationErr });
    }

    const headers = getGithubAuthHeaders(req);

    const { body: repoBody } = await httpsGet(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
      headers
    );
    const repo = JSON.parse(repoBody.toString());

    const branch = parsed.branch || repo.default_branch;

    let treeFiles = [];
    try {
      const { body: treeBody } = await httpsGet(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}?recursive=1`,
        headers
      );
      const tree = JSON.parse(treeBody.toString());
      treeFiles = (tree.tree || [])
        .filter(f => f.type === 'blob')
        .map(f => f.path);
    } catch (e) {
      console.warn('Could not fetch tree:', e.message);
    }

    const hasSetup = treeFiles.some(f => f === 'setup.py' || f.endsWith('/setup.py'));
    const hasConfig = treeFiles.some(f =>
      f.endsWith('config.json') || f.endsWith('config.sample.json')
    );
    const schemaFiles = treeFiles.filter(f => f.includes('/schemas/') && f.endsWith('.json'));
    const streamFiles = treeFiles.filter(f => f.endsWith('streams.py'));

    res.json({
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      html_url: repo.html_url,
      default_branch: branch,
      language: repo.language,
      stars: repo.stargazers_count,
      has_setup_py: hasSetup,
      has_config: hasConfig,
      schema_count: schemaFiles.length,
      stream_files: streamFiles.length,
      file_count: treeFiles.length,
    });
  } catch (err) {
    console.error('GitHub repo info error:', err.message);
    res.status(500).json({ error: 'Failed to fetch repo info' });
  }
});

// POST /api/github/import
router.post('/import', async (req, res) => {
  try {
    const { url } = req.body;

    const parsed = parseGithubUrl(url || '');
    const validationErr = validateParsedUrl(parsed);
    if (validationErr) {
      return res.status(400).json({ error: validationErr });
    }

    const headers = getGithubAuthHeaders(req);

    let branch = parsed.branch;
    if (!branch) {
      const { body: repoBody } = await httpsGet(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
        headers
      );
      const repo = JSON.parse(repoBody.toString());
      branch = repo.default_branch;
    }

    console.log(`Downloading ${parsed.owner}/${parsed.repo}@${branch}...`);

    const zipUrl = `https://github.com/${parsed.owner}/${parsed.repo}/archive/refs/heads/${branch}.zip`;
    const { body: zipBuffer } = await httpsGet(zipUrl, headers);

    console.log(`Downloaded zip: ${zipBuffer.length} bytes`);

    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    let tapName = parsed.repo;
    let tapDescription = '';
    const jsonFiles = [];
    const schemaFiles = {};
    const pythonFiles = {};

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;

      const rawName = entry.entryName;
      const parts = rawName.split('/');
      if (parts.length <= 1) continue;
      const name = parts.slice(1).join('/');
      const basename = path.basename(name).toLowerCase();

      if (basename === 'setup.py' || basename === 'setup.cfg') {
        try {
          const content = entry.getData().toString('utf-8');
          const nameMatch = content.match(/name\s*[=:]\s*["']([^"']+)["']/);
          if (nameMatch) tapName = nameMatch[1];
          const descMatch = content.match(/description\s*[=:]\s*["']([^"']+)["']/);
          if (descMatch) tapDescription = descMatch[1];
        } catch (e) { /* ignore */ }
      }

      if (basename === 'pyproject.toml') {
        try {
          const content = entry.getData().toString('utf-8');
          const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);
          if (nameMatch && tapName === parsed.repo) tapName = nameMatch[1];
        } catch (e) { /* ignore */ }
      }

      if (name.includes('/schemas/') && basename.endsWith('.json')) {
        try {
          schemaFiles[path.basename(name, '.json')] = JSON.parse(entry.getData().toString('utf-8'));
        } catch (e) { /* ignore */ }
      }

      if (basename.endsWith('.json') && !name.includes('/schemas/') && !name.includes('node_modules')) {
        try {
          const content = JSON.parse(entry.getData().toString('utf-8'));
          jsonFiles.push({ path: name, basename, content });
        } catch (e) { /* ignore */ }
      }

      if (basename === 'streams.py' || basename === 'stream.py') {
        try {
          pythonFiles[name] = entry.getData().toString('utf-8');
        } catch (e) { /* ignore */ }
      }
    }

    const configPriority = ['config.json', 'config.sample.json', 'tap_config.json'];
    jsonFiles.sort((a, b) => {
      const aIdx = configPriority.indexOf(a.basename);
      const bIdx = configPriority.indexOf(b.basename);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.basename.includes('config') ? -1 : 1;
    });

    let configJson = null;
    const validConfig = jsonFiles.find(f => {
      const c = f.content;
      return (c.api_url && c.streams) || (c.url && typeof c.url === 'string') ||
             (c.api_url && typeof c.api_url === 'string') || (c.streams && Array.isArray(c.streams));
    });

    if (validConfig) {
      configJson = validConfig.content;
      if (configJson.url && !configJson.api_url) {
        configJson.api_url = configJson.url;
        delete configJson.url;
      }
      if (!configJson.streams) configJson.streams = [];
      if (typeof configJson.streams === 'string') {
        configJson.streams = configJson.streams.split(',').map(s => ({
          name: s.trim(), path: `/${s.trim()}`,
          primary_keys: [], replication_method: 'FULL_TABLE', pagination_style: 'none',
        }));
      }
    } else {
      let streams = [];

      for (const [, content] of Object.entries(pythonFiles)) {
        const streamMatches = [...content.matchAll(/"([^"]+)":\s*\{[^}]*?"(?:entity_set_name|path|url)":\s*"([^"]+)"/gs)];
        for (const match of streamMatches) {
          const streamName = match[1];
          const endpoint = match[2];

          const keyMatch = content.match(new RegExp(`"${streamName}"[^}]*?"key_properties":\\s*\\[([^\\]]*?)\\]`));
          const keys = keyMatch
            ? keyMatch[1].match(/"([^"]+)"/g)?.map(k => k.replace(/"/g, '')) || []
            : [];

          const repMethodMatch = content.match(new RegExp(`"${streamName}"[^}]*?"replication_method":\\s*"([^"]+)"`));
          const repKeyMatch = content.match(new RegExp(`"${streamName}"[^}]*?"replication_key":\\s*"([^"]+)"`));

          streams.push({
            name: streamName,
            path: endpoint.startsWith('/') ? endpoint : `/${endpoint}`,
            primary_keys: keys,
            replication_method: repMethodMatch ? repMethodMatch[1] : 'FULL_TABLE',
            replication_key: repKeyMatch ? repKeyMatch[1] : undefined,
            pagination_style: 'none',
            schema: schemaFiles[streamName] || undefined,
          });
        }
      }

      if (streams.length === 0 && Object.keys(schemaFiles).length > 0) {
        for (const [name, schema] of Object.entries(schemaFiles)) {
          streams.push({
            name, path: `/${name}`,
            primary_keys: [], replication_method: 'FULL_TABLE', pagination_style: 'none', schema,
          });
        }
      }

      configJson = { api_url: '', auth_method: 'no_auth', streams };
    }

    // Encrypt before storage
    const db = await getDb();
    const id = uuidv4();
    const description = tapDescription || `Imported from github.com/${parsed.owner}/${parsed.repo}`;

    db.run(
      `INSERT INTO configs (id, name, description, config_json) VALUES (?, ?, ?, ?)`,
      [id, tapName, description, JSON.stringify(encryptConfig(configJson))]
    );
    saveDb();

    res.status(201).json({
      id,
      name: tapName,
      description,
      stream_count: (configJson.streams || []).length,
      schema_count: Object.keys(schemaFiles).length,
      source: `github.com/${parsed.owner}/${parsed.repo}`,
      message: `Successfully imported ${tapName} from GitHub`,
    });
  } catch (err) {
    console.error('GitHub import error:', err.message);
    res.status(500).json({ error: 'Failed to import from GitHub' });
  }
});

module.exports = router;
