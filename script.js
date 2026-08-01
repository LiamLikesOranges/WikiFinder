const MAX_VISITED = 220;
const MAX_DEPTH = 4;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_LINK_ROUNDS = 20;

const normalizeTitle = (title) => String(title || '').trim().replace(/\s+/g, ' ');

const canonicalKey = (title) => normalizeTitle(title).toLowerCase();

const pageUrl = (title) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

const wikipediaApiUrl = (params) => {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
};

async function sendWikipediaRequest(params) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(wikipediaApiUrl({
      ...params,
      format: 'json',
      formatversion: '2',
      origin: '*',
    }), { signal: controller.signal });

    if (!response.ok) {
      throw new Error('Wikipedia API connection failed.');
    }

    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Wikipedia request timed out. Please try again with a simpler pair of pages.');
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function resolveTitle(title) {
  const normalized = normalizeTitle(title);
  if (!normalized) {
    throw new Error('Missing title.');
  }

  const data = await sendWikipediaRequest({
    action: 'query',
    titles: normalized,
    redirects: '1',
  });

  const pages = data.query?.pages || [];
  if (!pages.length) {
    throw new Error(`Wikipedia did not return page data for ${title}.`);
  }

  const page = pages[0];
  if (page.missing) {
    throw new Error(`Page not found: ${title}`);
  }

  return page.title || normalized;
}

async function fetchLinksFromPage(title) {
  const normalized = normalizeTitle(title);
  const links = new Set();
  let continuation = null;

  for (let round = 0; round < MAX_LINK_ROUNDS; round += 1) {
    const params = {
      action: 'query',
      prop: 'links',
      titles: normalized,
      pllimit: 'max',
      plnamespace: '0',
      redirects: '1',
    };

    if (continuation) {
      params.plcontinue = continuation;
    }

    const data = await sendWikipediaRequest(params);
    const pages = data.query?.pages || [];
    const page = pages[0] || null;

    if (page?.links) {
      page.links.forEach((link) => {
        if (link.title) {
          links.add(link.title);
        }
      });
    }

    if (data.continue?.plcontinue) {
      continuation = data.continue.plcontinue;
    } else {
      break;
    }
  }

  return Array.from(links);
}

function buildPathFromParents(target, parents) {
  const path = [target];
  let current = target;
  while (parents[current]) {
    current = parents[current];
    path.unshift(current);
  }
  return path;
}

function findDirectLinkPath(startTitle, targetTitle, links) {
  if (!Array.isArray(links)) {
    return null;
  }

  const normalizedTarget = canonicalKey(targetTitle);
  const directMatch = links.find((candidate) => canonicalKey(candidate) === normalizedTarget);
  if (directMatch) {
    return [startTitle, directMatch];
  }

  return null;
}

function scoreCandidate(candidate, targetTitle) {
  const candidateKey = canonicalKey(candidate);
  const targetKey = canonicalKey(targetTitle);

  const tokens = targetKey.split(/\s+/).filter(Boolean);
  const overlap = tokens.filter((token) => candidateKey.includes(token)).length;
  const exactMatch = candidateKey === targetKey ? 100 : 0;
  const prefixBonus = targetKey.startsWith(candidateKey) || candidateKey.startsWith(targetKey) ? 20 : 0;
  return exactMatch + overlap * 25 + prefixBonus;
}

function rankLinks(links, targetTitle) {
  return [...links]
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, targetTitle) }))
    .sort((a, b) => b.score - a.score)
    .map(({ candidate }) => candidate);
}

async function findShortestPathWithStats(start, target, onProgress = () => {}) {
  const startTitle = await resolveTitle(start);
  const targetTitle = await resolveTitle(target);
  const startKey = canonicalKey(startTitle);
  const targetKey = canonicalKey(targetTitle);

  if (startKey === targetKey) {
    return { path: [startTitle], visited: 1 };
  }

  const startLinks = await fetchLinksFromPage(startTitle);
  const immediatePath = findDirectLinkPath(startTitle, targetTitle, startLinks);
  if (immediatePath) {
    return { path: immediatePath, visited: 1 };
  }

  const queue = [{ title: startTitle, depth: 0 }];
  const visited = new Set([startKey]);
  const parents = {};
  let visitedCount = 0;

  while (queue.length && visitedCount < MAX_VISITED) {
    const { title: current, depth } = queue.shift();
    visitedCount += 1;
    onProgress(visitedCount, current);

    const currentKey = canonicalKey(current);
    if (currentKey === targetKey) {
      return { path: buildPathFromParents(current, parents), visited: visitedCount };
    }

    try {
      const links = await fetchLinksFromPage(current);
      let foundTarget = null;
      const rankedLinks = rankLinks(links, targetTitle);

      rankedLinks.slice(0, 8).forEach((candidate) => {
        const candidateKey = canonicalKey(candidate);
        if (visited.has(candidateKey)) {
          return;
        }

        const nextDepth = depth + 1;
        if (nextDepth > MAX_DEPTH) {
          return;
        }

        visited.add(candidateKey);
        parents[candidate] = current;
        if (candidateKey === targetKey) {
          foundTarget = candidate;
          return;
        }
        queue.push({ title: candidate, depth: nextDepth });
      });

      if (foundTarget) {
        return { path: buildPathFromParents(foundTarget, parents), visited: visitedCount };
      }
    } catch (error) {
      throw new Error(`Wikipedia API request failed: ${error.message}`);
    }
  }

  const path = visitedCount > 0 && Object.keys(parents).length > 0
    ? buildPathFromParents(targetTitle, parents)
    : [];

  return { path, visited: visitedCount };
}

async function findShortestPath(start, target) {
  const result = await findShortestPathWithStats(start, target);
  return result.path;
}

function createAppController() {
  if (typeof document === 'undefined') {
    return null;
  }

  const startInput = document.getElementById('start');
  const targetInput = document.getElementById('target');
  const findButton = document.getElementById('findButton');
  const resetButton = document.getElementById('resetButton');
  const statusText = document.getElementById('statusText');
  const progressFill = document.getElementById('progressFill');
  const visitedCountText = document.getElementById('visitedCount');
  const searchLog = document.getElementById('searchLog');
  const pathDisplay = document.getElementById('pathDisplay');

  function appendLog(message, important = false) {
    const node = document.createElement('p');
    node.textContent = message;
    if (important) {
      node.innerHTML = `<strong>${message}</strong>`;
    }
    searchLog.prepend(node);
  }

  function renderPath(path) {
    pathDisplay.innerHTML = '';
    if (!path.length) {
      pathDisplay.textContent = 'No path was found. Try a different start or target.';
      return;
    }
    path.forEach((title, index) => {
      const step = document.createElement('div');
      step.className = 'path-step';
      const number = document.createElement('span');
      number.innerHTML = `<strong>#${index + 1}</strong> ${title}`;
      const link = document.createElement('a');
      link.href = pageUrl(title);
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = 'Open page';
      step.append(number, link);
      pathDisplay.appendChild(step);
    });
  }

  function updateProgress(count, limit) {
    visitedCountText.textContent = count;
    const percent = Math.min(100, Math.round((count / limit) * 100));
    progressFill.style.width = `${percent}%`;
  }

  function setStatus(text) {
    statusText.textContent = text;
  }

  function resetUI() {
    searchLog.innerHTML = '';
    pathDisplay.innerHTML = 'Enter a start and target to begin the adventure.';
    progressFill.style.width = '0%';
    visitedCountText.textContent = '0';
    setStatus('Ready for your quickest Wiki jump.');
  }

  findButton.addEventListener('click', async () => {
    const start = startInput.value;
    const target = targetInput.value;

    findButton.disabled = true;
    resetButton.disabled = true;
    setStatus('Launching the search engine...');
    searchLog.innerHTML = '';
    pathDisplay.innerHTML = 'Searching for the fastest path...';

    try {
      let progressCount = 0;
      const result = await findShortestPathWithStats(start, target, (visited, page) => {
        progressCount = visited;
        updateProgress(progressCount, MAX_VISITED);
        setStatus(`Exploring ${page}...`);
      });
      updateProgress(result.visited || progressCount, MAX_VISITED);
      appendLog(result.path.length
        ? `Path found in ${result.path.length} steps after checking ${result.visited} pages.`
        : `No path found after checking ${result.visited} pages.`, true);

      if (!result.path.length) {
        renderPath([]);
        setStatus('No path found within the search limit. Keep exploring!');
        appendLog('Try another pair of pages or use a more popular starting point.');
      } else {
        renderPath(result.path);
        setStatus(`Found a path in ${result.path.length} hops!`);
        appendLog('Enjoy the journey! Each step is one Wikipedia link away.', true);
      }
    } catch (error) {
      setStatus('Something went wrong during the search. Please try again.');
      appendLog(error.message, true);
      pathDisplay.innerHTML = 'Unable to compute the path. Refresh and try again.';
    } finally {
      findButton.disabled = false;
      resetButton.disabled = false;
    }
  });

  resetButton.addEventListener('click', () => {
    startInput.value = '';
    targetInput.value = '';
    resetUI();
  });

  resetUI();
  return { resetUI };
}

function initApp() {
  if (typeof document !== 'undefined') {
    createAppController();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeTitle,
    canonicalKey,
    buildPathFromParents,
    findDirectLinkPath,
    rankLinks,
    findShortestPath,
    findShortestPathWithStats,
    initApp,
  };
}

if (typeof window !== 'undefined') {
  window.WikiFinder = {
    normalizeTitle,
    canonicalKey,
    buildPathFromParents,
    findDirectLinkPath,
    rankLinks,
    findShortestPath,
    findShortestPathWithStats,
    initApp,
  };
  window.addEventListener('DOMContentLoaded', initApp);
}
