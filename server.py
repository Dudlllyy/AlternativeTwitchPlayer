import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import sys
import webbrowser
import threading
import re
import shutil

PORT = 8000

if getattr(sys, 'frozen', False):
    os.chdir(sys._MEIPASS)


class TwitchHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        # ==========================================
        # 1. ЗАПРОС ПРЯМОГО ЭФИРА (m3u8)
        # ==========================================
        if self.path.startswith('/api/m3u8'):
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            channel = params.get('channel', [''])[0]
            if not channel:
                self.send_error(400, "Missing channel")
                return
            try:
                client_id = 'kimne78kx3ncx6brgo4mv6wki5h1ko'

                gql_query = f""
                            query {{ 
                                streamPlaybackAccessToken(channelName: "{channel}", params: {{platform: "web", playerBackend: "mediaplayer", playerType: "embed"}}) {{ 
                                    value 
                                    signature 
                                }} 
                            }}
                            ""
                gql_data = json.dumps({"query": gql_query}).encode('utf-8')

                headers = {'Client-Id': client_id, 'User-Agent': 'Mozilla/5.0'}
                req = urllib.request.Request('https://gql.twitch.tv/gql', data=gql_data, headers=headers)
                with urllib.request.urlopen(req) as response:
                    res = json.loads(response.read().decode('utf-8'))

                    if 'data' not in res or not res['data'].get('streamPlaybackAccessToken'):
                        print(f"\n[ОШИБКА API ТВИЧА - LIVE] Нестандартный ответ: {res}\n")
                        try:
                            self.send_error(500, "Twitch API Error")
                        except:
                            pass
                        return

                    token = res['data']['streamPlaybackAccessToken']['value']
                    sig = res['data']['streamPlaybackAccessToken']['signature']

                token_encoded = urllib.parse.quote(token)
                usher_url = f"https://usher.ttvnw.net/api/channel/hls/{channel}.m3u8?client_id={client_id}&token={token_encoded}&sig={sig}&allow_source=true&allow_audio_only=true"

                req_m3u8 = urllib.request.Request(usher_url, headers=headers)
                with urllib.request.urlopen(req_m3u8) as response_m3u8:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/vnd.apple.mpegurl')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(response_m3u8.read())
            except Exception:
                self.send_error(500)

        # ==========================================
        # 2. ЛЕГКИЙ СТАТУС ОНЛАЙНА
        # ==========================================
        elif self.path.startswith('/api/live_status'):
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            channel = params.get('channel', [''])[0]
            try:
                req = urllib.request.Request(f'https://decapi.me/twitch/viewercount/{channel}',
                                             headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as response:
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/plain')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(response.read())
            except Exception:
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b"offline")

        # ==========================================
        # 3. СПИСОК ЗАПИСЕЙ (VODS)
        # ==========================================
        elif self.path.startswith('/api/vods'):
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            channel = params.get('channel', [''])[0]
            try:
                client_id = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
                gql_query = f"""query {{ user(login: "{channel}") {{ videos(first: 20, type: ARCHIVE) {{ edges {{ node {{ id title lengthSeconds previewThumbnailURL(width: 320, height: 180) createdAt }} }} }} }} }}""
                gql_data = json.dumps({"query": gql_query}).encode('utf-8')
                req = urllib.request.Request('https://gql.twitch.tv/gql', data=gql_data,
                                             headers={'Client-Id': client_id, 'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as response:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(response.read())
            except Exception:
                self.send_error(500)

                # ==========================================
                # 4. ГЛАВНЫЙ ПЛЕЙЛИСТ VOD
                # ==========================================
        elif self.path.startswith('/api/vod_m3u8'):
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            video_id = params.get('video_id', [''])[0]

            is_audio_mode = params.get('audio', ['0'])[0] == '1'

            try:

                client_id = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
                gql_query = f"""query {{ videoPlaybackAccessToken(id: "{video_id}", params: {{platform: "web", playerBackend: "mediaplayer", playerType: "site"}}) {{ value signature }} }}""
                gql_data = json.dumps({"query": gql_query}).encode('utf-8')
                req = urllib.request.Request('https://gql.twitch.tv/gql', data=gql_data,
                                                 headers={'Client-Id': client_id, 'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as response:
                    res = json.loads(response.read().decode('utf-8'))
                    token = urllib.parse.quote(res['data']['videoPlaybackAccessToken']['value'])
                    sig = res['data']['videoPlaybackAccessToken']['signature']

                usher_url = f"https://usher.ttvnw.net/vod/{video_id}.m3u8?client_id={client_id}&token={token}&sig={sig}&allow_source=true&allow_audio_only=true"
                req_m3u8 = urllib.request.Request(usher_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req_m3u8) as response_m3u8:
                    lines = response_m3u8.read().decode('utf-8').split('\n')

                final_lines = []
                for line in lines:
                    if is_audio_mode and ('RESOLUTION' in line or 'CODECS="avc1' in line):
                        continue 

                    if line.startswith('https://'):
                        final_lines.append(
                            f"http://localhost:{PORT}/api/vod_subfile?url={urllib.parse.quote(line)}")
                    else:
                        match = re.search(r'URI="(https://[^"]+)"', line)
                        if match:
                            raw_uri = match.group(1)
                            final_lines.append(line.replace(raw_uri,
                                                                f"http://localhost:{PORT}/api/vod_subfile?url={urllib.parse.quote(raw_uri)}"))
                        else:
                            final_lines.append(line)

                self.send_response(200)
                self.send_header('Content-Type', 'application/vnd.apple.mpegurl')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write('\n'.join(final_lines).encode('utf-8'))
            except Exception:
                self.send_error(500)

        # ==========================================
        # 5. ПАРСЕР ПОД-ПЛЕЙЛИСТОВ VOD
        # ==========================================
        elif self.path.startswith('/api/vod_subfile'):
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            target_url = params.get('url', [''])[0]
            try:
                req = urllib.request.Request(target_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as response:
                    lines = response.read().decode('utf-8').split('\n')
                base_url = target_url[:target_url.rfind('/') + 1]

                for i in range(len(lines)):
                    line = lines[i].strip()
                    if not line: continue
                    if line.startswith('#'):
                        match = re.search(r'URI="([^"]+)"', line)
                        if match:
                            uri = match.group(1)
                            abs_uri = uri if uri.startswith('http') else base_url + uri
                            lines[i] = line.replace(f'URI="{uri}"',
                                                    f'URI="http://localhost:{PORT}/api/vod_segment?url={urllib.parse.quote(abs_uri)}"')
                    else:
                        abs_uri = line if line.startswith('http') else base_url + line
                        lines[i] = f"http://localhost:{PORT}/api/vod_segment?url={urllib.parse.quote(abs_uri)}"

                self.send_response(200)
                self.send_header('Content-Type', 'application/vnd.apple.mpegurl')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write('\n'.join(lines).encode('utf-8'))
            except Exception:
                self.send_error(500)

        # ==========================================
        # 6. СВЕРХБЫСТРЫЙ ПРОКСИ СЕГМЕНТОВ (shutil)
        # ==========================================
        elif self.path.startswith('/api/vod_segment'):
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            target_url = params.get('url', [''])[0]
            try:
                req = urllib.request.Request(target_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as response:
                    self.send_response(200)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    clean_path = urllib.parse.urlparse(target_url).path
                    if clean_path.endswith('.ts'):
                        self.send_header('Content-Type',
                                         'audio/mp2t' if 'audio' in target_url.lower() else 'video/MP2T')
                    elif clean_path.endswith('.mp4'):
                        self.send_header('Content-Type', 'audio/mp4' if 'audio' in target_url.lower() else 'video/mp4')
                    self.end_headers()


                    shutil.copyfileobj(response, self.wfile)

            except (ConnectionError, BrokenPipeError):
                pass
            except Exception:
                pass

        # ==========================================
        # 7. ОТДАЧА СТАТИЧЕСКИХ ФАЙЛОВ
        # ==========================================
        else:
            super().do_GET()


def open_browser():
    webbrowser.open(f'http://localhost:{PORT}')

def is_server_running(port):
    """Проверяет, занят ли порт (работает ли уже наш сервер в фоне)"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

if __name__ == '__main__':

    if is_server_running(PORT):
        print("Сервер уже работает в фоне. Просто открываем вкладку...")
        open_browser()
        sys.exit(0)
        
    os.chdir(get_base_path())
    with http.server.ThreadingHTTPServer(("", PORT), TwitchHandler) as httpd:
        httpd.daemon_threads = True 
        print(f"Server is running! PORT: {PORT}")
        threading.Timer(1.0, open_browser).start()
        httpd.serve_forever()
