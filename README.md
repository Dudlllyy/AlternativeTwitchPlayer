# AlternativeTwitchPlayer
A lightweight, fast, and independent desktop client for watching Twitch streams without heavy system resource consumption. Built using Python, HLS.js, and raw WebSockets with native 7TV emote support.

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
