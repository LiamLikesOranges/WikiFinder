const startInput = document.getElementById('start');
const targetInput = document.getElementById('target');
const findButton = document.getElementById('findButton');
const resetButton = document.getElementById('resetButton');
const statusText = document.getElementById('statusText');
const progressFill = document.getElementById('progressFill');
const visitedCountText = document.getElementById('visitedCount');
const searchLog = document.getElementById('searchLog');
const pathDisplay = document.getElementById('pathDisplay');

const MAX_DEPTH = 6;
const MAX_VISITED = 2200;

const normalizeTitle = (title) => title.trim().replace(/\s+/g, ' ').replace(/\?/g, '%3F');

const pageUrl = (title) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

const apiUrl = (title, plcontinue) => {
  const base = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=links&titles=${encodeURIComponent(title)}&pllimit=max&redirects=1&plnamespace=0`;
  return plcontinue ? `${base}&plcontinue=${encodeURIComponent(plcontinue)}` : base;
};

const removeNamespace = (text) => text.replace(/^\s*([^:]+:)?\s*/, '').trim();

async function fetchLinks(title) {
  const normalized = normalizeTitle(title);
  const links = new Set();
  let continuation = null;

  for (let round = 0; round < 10; round += 1) {
    const response = await fetch(apiUrl(normalized, continuation));
    if (!response.ok) {
      throw new Error('Wikipedia API connection failed.');
    }
    const data = await response.json();
    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0];

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

function appendLog(message, important = false) {
  const node = document.createElement('p');
  node.textContent = message;
  if (important) node.innerHTML = `<strong>${message}</strong>`;
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

async function findShortestPath(start, target) {
  const query = new URLSearchParams({ start, target });
  const response = await fetch(`/api/path?${query}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Server error while finding the path.');
  }

  const data = await response.json();
  if (data.status !== 'ok') {
    throw new Error(data.message || 'Could not compute the path.');
  }

  updateProgress(data.visited || 0, MAX_VISITED);
  appendLog(data.message || `Path found in ${data.path.length} steps.`, true);
  return data.path;
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
    const path = await findShortestPath(start, target);
    if (!path) {
      renderPath([]);
      setStatus('No path found within the search limit. Keep exploring!');
      appendLog('Try another pair of pages or use a more popular starting point.');
    } else {
      renderPath(path);
      setStatus(`Found a path in ${path.length} hops!`);
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
