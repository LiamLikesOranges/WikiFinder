#!/usr/bin/env python3
"""WikiFinder server entry point.

Run this script and visit http://127.0.0.1:8000 to open the web UI.
The server serves the static site and provides a backend endpoint for finding
shortest Wikipedia page paths.
"""

import argparse
import http.server
import json
import logging
import os
import socketserver
import sys
import time
import urllib.parse
import urllib.request

MAX_DEPTH = 6
MAX_VISITED = 1200
USER_AGENT = 'WikiFinder/1.0 (https://github.com/LiamLikesOranges/WikiFinder)'


def normalize_title(title: str) -> str:
    return title.strip().replace(' ', '_')


def canonical_key(title: str) -> str:
    return normalize_title(title).replace('_', ' ').lower()


def wikipedia_api_url(params: dict[str, str]) -> str:
    encoded = urllib.parse.urlencode(params)
    return f'https://en.wikipedia.org/w/api.php?{encoded}'


def send_wikipedia_request(params: dict[str, str]) -> dict:
    params['format'] = 'json'
    params['formatversion'] = '2'
    params['origin'] = '*'  # safe for browser-like API usage
    url = wikipedia_api_url(params)
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=20) as response:
        body = response.read().decode('utf-8')
    return json.loads(body)


def resolve_title(title: str) -> str:
    if not title:
        raise ValueError('Missing title.')
    data = send_wikipedia_request({
        'action': 'query',
        'titles': normalize_title(title),
        'redirects': '1',
    })
    pages = data.get('query', {}).get('pages', [])
    if not pages:
        raise ValueError(f'Wikipedia did not return page data for {title!r}.')
    page = pages[0]
    if page.get('missing'):
        raise ValueError(f'Page not found: {title}')
    return page.get('title', title)


def fetch_links_from_page(title: str) -> list[str]:
    normalized_title = normalize_title(title)
    links = []
    continue_token = None
    for _ in range(20):
        params = {
            'action': 'query',
            'prop': 'links',
            'titles': normalized_title,
            'pllimit': 'max',
            'plnamespace': '0',
            'redirects': '1',
        }
        if continue_token:
            params['plcontinue'] = continue_token
        data = send_wikipedia_request(params)
        pages = data.get('query', {}).get('pages', [])
        if pages:
            page = pages[0]
            for link in page.get('links', []):
                candidate = link.get('title')
                if candidate:
                    links.append(candidate)
        continuation = data.get('continue', {}).get('plcontinue')
        if not continuation:
            break
        continue_token = continuation
    return links


def find_shortest_path(start: str, target: str) -> tuple[list[str], int]:
    start_title = resolve_title(start)
    target_title = resolve_title(target)
    start_key = canonical_key(start_title)
    target_key = canonical_key(target_title)

    if start_key == target_key:
        return [start_title], 1

    queue = [start_title]
    visited = {start_key}
    parent: dict[str, str] = {}
    visited_count = 0

    while queue and visited_count < MAX_VISITED:
        current = queue.pop(0)
        visited_count += 1
        current_key = canonical_key(current)

        if current_key == target_key:
            break

        try:
            links = fetch_links_from_page(current)
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f'Wikipedia API request failed: {exc}') from exc

        for candidate in links:
            candidate_key = canonical_key(candidate)
            if candidate_key in visited:
                continue
            visited.add(candidate_key)
            parent[candidate] = current
            if candidate_key == target_key:
                path = [candidate]
                node = current
                while node:
                    path.insert(0, node)
                    node = parent.get(node)
                return path, visited_count
            queue.append(candidate)
            if len(visited) >= MAX_VISITED:
                break

    return [], visited_count


class WikiFinderHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/path':
            self.handle_path_api(parsed.query)
            return
        if parsed.path == '/':
            self.path = '/index.html'
        return super().do_GET()

    def handle_path_api(self, query: str):
        params = urllib.parse.parse_qs(query)
        start = params.get('start', [''])[0]
        target = params.get('target', [''])[0]

        if not start or not target:
            self.send_json({'status': 'error', 'message': 'Missing start or target page.'}, code=400)
            return

        try:
            path, visited = find_shortest_path(start, target)
        except Exception as exc:
            logging.exception('Failed to compute path')
            self.send_json({'status': 'error', 'message': str(exc)}, code=500)
            return

        if not path:
            self.send_json({
                'status': 'ok',
                'path': [],
                'visited': visited,
                'message': f'No path found after checking {visited} pages.',
            })
            return

        self.send_json({
            'status': 'ok',
            'path': path,
            'visited': visited,
            'message': f'Path found in {len(path)} steps after checking {visited} pages.',
        })

    def send_json(self, payload: dict, code: int = 200):
        payload_bytes = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload_bytes)))
        self.end_headers()
        self.wfile.write(payload_bytes)


def run_server(port: int, directory: str):
    os.chdir(directory)
    handler = lambda *args, **kwargs: WikiFinderHTTPRequestHandler(*args, directory=directory, **kwargs)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('127.0.0.1', port), handler) as httpd:
        logging.info('WikiFinder server running at http://127.0.0.1:%d', port)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            logging.info('Server stopped by user.')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Run the WikiFinder web server.')
    parser.add_argument('--port', '-p', type=int, default=8000, help='Port to listen on.')
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
    run_server(args.port, os.path.dirname(os.path.abspath(__file__)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
