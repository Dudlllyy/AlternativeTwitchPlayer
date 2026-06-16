import http.server
import socketserver
import urllib.request
import urllib.parse
import urllib.error
import json
import os
import sys
import webbrowser
import threading
import socket


# Ищем первый свободный порт начиная с 8000
def find_free_port(start_port=8000, max_port=8010):
    for port in range(start_port, max_port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('localhost', port)) != 0:
                return port
    return start_port


PORT = find_free_port()

if getattr(sys, 'frozen', False):
    os.chdir(sys._MEIPASS)


class TwitchHandler(http.server.SimpleHTTPRequestHandler):

    # Отключаем спам в консоли обо всех загрузках файлов
    def log_message(self, format, *args):
        pass

    def end_headers(self):
        # Строго запрещаем браузеру кэшировать любые файлы с этого сервера
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        if self.path.startswith('/api/m3u8'):
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            channel = params.get('channel', [''])[0]

            if not channel:
                self.send_error(400, "Missing channel parameter")
                return

            try:
                client_id = 'kimne78kx3ncx6brgo4mv6wki5h1ko'

                gql_data = json.dumps({
                    "operationName": "PlaybackAccessToken",
                    "extensions": {
                        "persistedQuery": {
                            "version": 1,
                            "sha256Hash": "0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712"
                        }
                    },
                    "variables": {
                        "isLive": True,
                        "login": channel,
                        "isVod": False,
                        "vodID": "",
                        "playerType": "embed"
                    }
                }).encode('utf-8')

                spoofed_ip = '77.88.55.55'

                headers = {
                    'Client-Id': client_id,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                    'Origin': 'https://www.twitch.tv',
                    'Referer': 'https://www.twitch.tv/',
                    'X-Forwarded-For': spoofed_ip,
                }

                req = urllib.request.Request('https://gql.twitch.tv/gql', data=gql_data, headers=headers)
                with urllib.request.urlopen(req) as response:
                    res = json.loads(response.read().decode('utf-8'))
                    token = res['data']['streamPlaybackAccessToken']['value']
                    sig = res['data']['streamPlaybackAccessToken']['signature']

                token_encoded = urllib.parse.quote(token)
                usher_url = f"https://usher.ttvnw.net/api/channel/hls/{channel}.m3u8?client_id={client_id}&token={token_encoded}&sig={sig}&allow_source=true&allow_audio_only=true"

                req_m3u8 = urllib.request.Request(usher_url, headers=headers)
                with urllib.request.urlopen(req_m3u8) as response_m3u8:
                    m3u8_content = response_m3u8.read()

                self.send_response(200)
                self.send_header('Content-Type', 'application/vnd.apple.mpegurl')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(m3u8_content)

            # УМНЫЙ ПЕРЕХВАТ ОШИБОК: Если стрим оффлайн, отдаем 404, а не крашим сервер
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    self.send_response(404)
                    self.end_headers()
                    self.wfile.write(b"Offline")
                else:
                    self.send_response(e.code)
                    self.end_headers()
                    self.wfile.write(str(e).encode('utf-8'))

            except Exception as e:
                print(f"\n[Error] System Error: {e}")
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
        else:
            super().do_GET()


# Функция для авто-открытия браузера
def open_browser():
    webbrowser.open(f'http://localhost:{PORT}')


# Используем ThreadingHTTPServer для многопоточности (чтобы интерфейс не зависал)
try:
    with http.server.ThreadingHTTPServer(("", PORT), TwitchHandler) as httpd:
        print(f"==================================================")
        print(f"🚀 Alternative Twitch Server is running!")
        print(f"🌐 Local URL: http://localhost:{PORT}")
        print(f"❌ To turn off the player, simply close this window.")
        print(f"==================================================\n")

        threading.Timer(1.0, open_browser).start()
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\nShutting down server...")