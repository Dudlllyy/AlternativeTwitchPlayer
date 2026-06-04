import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.io.*;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class TwitchServer {

    private static final int PORT = 8000;
    private static final String TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);

        server.createContext("/", new StaticFileHandler());
        server.createContext("/api/m3u8", new TwitchApiHandler());
        server.setExecutor(null);
        server.start();
        System.out.println("🚀 Java Server is running on http://localhost:" + PORT);
    }

    static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/")) {
                path = "/index.html";
            }

            setNoCacheHeaders(exchange);

            Path filePath = Paths.get("./src/main/java" + path);
            if (Files.exists(filePath) && !Files.isDirectory(filePath)) {
                byte[] fileBytes = Files.readAllBytes(filePath);

                if (path.endsWith(".html")) exchange.getResponseHeaders().set("Content-Type", "text/html; charset=UTF-8");
                else if (path.endsWith(".css")) exchange.getResponseHeaders().set("Content-Type", "text/css; charset=UTF-8");
                else if (path.endsWith(".js")) exchange.getResponseHeaders().set("Content-Type", "application/javascript; charset=UTF-8");

                exchange.sendResponseHeaders(200, fileBytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(fileBytes);
                }
            } else {
                String response = "404 (Not Found)\n";
                exchange.sendResponseHeaders(404, response.length());
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(response.getBytes());
                }
            }
        }
    }
    static class TwitchApiHandler implements HttpHandler {
        private final HttpClient httpClient = HttpClient.newHttpClient();

        @Override
        public void handle(HttpExchange exchange) throws IOException {
            setNoCacheHeaders(exchange);
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");

            String query = exchange.getRequestURI().getQuery();
            String channel = null;
            if (query != null && query.startsWith("channel=")) {
                channel = query.substring(8);
            }

            if (channel == null || channel.isEmpty()) {
                sendResponse(exchange, 400, "Missing channel parameter");
                return;
            }

            try {
                String gqlPayload = String.format("{\"operationName\":\"PlaybackAccessToken_Template\",\"query\":\"query PlaybackAccessToken_Template($login: String!, $playerType: String!) {  streamPlaybackAccessToken(channelName: $login, params: {platform: \\\"web\\\", playerBackend: \\\"mediaplayer\\\", playerType: $playerType}) {    value    signature    __typename  }}\",\"variables\":{\"login\":\"%s\",\"playerType\":\"embed\"}}", channel);

                HttpRequest gqlRequest = HttpRequest.newBuilder()
                        .uri(URI.create("https://gql.twitch.tv/gql"))
                        .header("Client-Id", TWITCH_CLIENT_ID)
                        .header("Content-Type", "application/json")
                        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                        .header("Origin", "https://www.twitch.tv")
                        .header("Referer", "https://www.twitch.tv/")
                        .POST(HttpRequest.BodyPublishers.ofString(gqlPayload))
                        .build();

                HttpResponse<String> gqlResponse = httpClient.send(gqlRequest, HttpResponse.BodyHandlers.ofString());
                String body = gqlResponse.body();

                String value = extractJsonValue(body, "value");
                String signature = extractJsonValue(body, "signature");

                if (value == null || signature == null) {
                    System.err.println("❌ Error API Twitch: " + body);
                    throw new RuntimeException("Failed to parse token from Twitch");
                }

                String encodedValue = URLEncoder.encode(value, StandardCharsets.UTF_8);
                String m3u8Url = String.format("https://usher.ttvnw.net/api/channel/hls/%s.m3u8?client_id=%s&token=%s&sig=%s&allow_source=true&allow_audio_only=true",
                        channel, TWITCH_CLIENT_ID, encodedValue, signature);

                HttpRequest m3u8Request = HttpRequest.newBuilder()
                        .uri(URI.create(m3u8Url))
                        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                        .GET()
                        .build();

                HttpResponse<String> m3u8Response = httpClient.send(m3u8Request, HttpResponse.BodyHandlers.ofString());

                if (m3u8Response.statusCode() == 404) {
                    sendResponse(exchange, 404, "Channel is offline");
                    return;
                }
                exchange.getResponseHeaders().set("Content-Type", "application/vnd.apple.mpegurl");
                sendResponse(exchange, 200, m3u8Response.body());

            } catch (Exception e) {
                if (e.getMessage() != null && e.getMessage().contains("разорвала установленное подключение")) {
                    return;
                }
                e.printStackTrace();
                try { sendResponse(exchange, 500, "Internal Server Error"); } catch (Exception ignored) {}
            }
        }

        private void sendResponse(HttpExchange exchange, int statusCode, String response) throws IOException {
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(statusCode, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        }
        private String extractJsonValue(String json, String key) {
            Pattern pattern = Pattern.compile("\"" + key + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
            Matcher matcher = pattern.matcher(json);
            if (matcher.find()) {
                return matcher.group(1).replace("\\\"", "\"").replace("\\\\", "\\");
            }
            return null;
        }
    }
    private static void setNoCacheHeaders(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        exchange.getResponseHeaders().set("Pragma", "no-cache");
        exchange.getResponseHeaders().set("Expires", "0");
    }
}
