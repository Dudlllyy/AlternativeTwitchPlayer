# AlternativeTwitchPlayer
A lightweight, fast, and independent desktop client for watching Twitch streams without heavy system resource consumption. Built using Python, HLS.js, and raw WebSockets with native 7TV emote support.
## 🆚 Why use this over the default Twitch website?

The official Twitch website has grown into a heavy, resource-intensive platform. It runs dozens of background scripts, loads intrusive advertisements, and constantly collects telemetry data. 

This alternative player was built with a completely different philosophy: **give the user full control, maximize performance, and respect digital privacy.**

Here is exactly how it differs from the default experience:

* **Zero Bloatware & Telemetry:** The official player runs heavy tracking and analytical scripts that monitor your behavior. This client cuts out the middleman, connecting you directly to the raw HLS video stream and IRC chat server. Your viewing habits remain private, and no unnecessary data is harvested.
* **True Resource Efficiency:** On older hardware or laptops, the default Twitch site can consume massive amounts of RAM and CPU power. By using Vanilla JavaScript and a minimal DOM structure, this player runs flawlessly even on low-end machines.
* **Native 7TV Integration:** To see custom 7TV emotes on the official site, you have to install heavy browser extensions that inject code into every page. This player renders global and channel 7TV emotes natively out of the box, with zero performance penalty.
* **Honest "Audio Only" Mode:** On desktop, the default Twitch player often continues to decode video in the background even when hidden. This app explicitly requests the audio-only `m3u8` playlist from the server, instantly freeing up your GPU and drastically reducing bandwidth.
* **Smart Chat Suspension:** Chatting on heavily populated channels (like major esports events) normally causes massive memory leaks and CPU spikes due to constant HTML repainting. In this player, hiding the chat *completely pauses* message processing and memory allocation until you bring it back.
* **Manual Latency Control:** The official player aggressively buffers video to prevent stuttering, which can easily put you 10-15 seconds behind the live chat. This app gives you a real-time latency indicator and a dedicated button to manually snap your player to the absolute live edge of the stream.
* **Ad-Free Core:** By utilizing a backend proxy server to fetch the raw stream manifests, it natively bypasses the bloated commercial segments baked into the standard web player.
The project is structured cleanly into separate layers:
* `server.py` — The backend proxy server handling CORS bypass and Twitch GraphQL API interaction.
* `index.html` — The semantic HTML5 structural layout.
* `style.css` — Modern, high-performance styling and UI transitions.
* `script.js` — Core frontend logic, WebSocket chat client, and custom player controls.

---

## 🚀 Key Features
* **Audio Only Mode:** Completely stops video decoding to save maximum CPU/GPU resources and network bandwidth.
* **Smart Chat Component:** Suspends message parsing and DOM re-rendering when chat is hidden, preventing browser lag on highly active channels.
* **Native 7TV Emotes:** Automatically fetches and renders global and channel-specific 7TV emotes seamlessly in real-time.
* **Latency Indicator & Sync:** Displays exact stream delay with a one-click button to instantly snap back to the absolute live edge.
* **Drag-to-Scroll Bookmarks:** Save your favorite channels locally and navigate through them using smooth mouse dragging (drag-scroll layout).
* **Zero Zoom Dependency:** Fully optimized layout adapts gracefully to any window or screen resolution without stretching or broken elements.

---

## 📥 How to Run the Project

### Option 1: Running the Executable (.exe) — For Regular Users
This is the easiest method as it requires no coding environment or extra dependencies installed on your computer.

1. Go to the **Releases** section on the right side of this GitHub repository page.
2. Download the latest compiled executable file (e.g., `TwitchPlayer.exe` or `server.exe`).
3. Place the file anywhere on your computer (e.g., your Desktop).
4. **Double-click** the executable to run it.
   * A black command prompt/terminal window will open—this is your local backend running.
   * Within a second, your default web browser will automatically launch a new tab opening the application at `http://localhost:8000`.
5. *To close the application:* Simply close the black console window by clicking the **X** button.

---

### Option 2: Running from Source Code — For Developers
If you want to view, modify, or run the raw source code using Python:

#### Prerequisites
* Ensure you have **Python 3.x** installed on your system. You can check this by typing `python --version` in your system command prompt.

#### Setup Steps
1. Download all 4 core project files and place them inside the **exact same folder**:
   * `server.py`
   * `index.html`
   * `style.css`
   * `script.js`
2. Open your preferred terminal or command prompt inside that specific folder (in PyCharm, you can just open the built-in terminal at the bottom).
3. Start the local server by executing the following command:
   ```bash
   python server.py
  
4. The terminal will log that the server has started successfully and will automatically launch your default browser to http://localhost:8000.

5. Keep the terminal running while watching. Press Ctrl + C in the terminal window to shut down the server when finished.

📱 Option 3: Watch on your Phone (Local Network)

Since the server runs locally on your PC, you can connect to it from your mobile device and enjoy the fully adapted mobile interface!

1.   Make sure your local server is running on your computer (via .exe or Python).

2.   Ensure your phone is connected to the same Wi-Fi network as your computer.

3.   Find your computer's local IP address:

        Windows: Open the Command Prompt (cmd), type ipconfig, and look for the IPv4 Address (it usually looks like 192.168.x.x).

4.   Open the web browser on your phone and enter your IP address followed by the port 8000.

        Example: http://192.168.1.5:8000

5.   Note: If the page doesn't load on your phone, Windows Defender Firewall might be blocking the connection. You may need to allow incoming connections for port 8000 in your Firewall settings.
