const video = document.getElementById('video');
const wrapper = document.getElementById('player-wrapper');
const audioBtn = document.getElementById('audioToggleBtn');
const syncBtn = document.getElementById('syncLiveBtn');
const qSelect = document.getElementById('qualitySelect');

let hls;
let isAudioOnly = false;
let isChatVisible = true;
let isTheater = false;
let ws = null;

function escapeHtml(unsafe) { return String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        wrapper.requestFullscreen().catch(err => alert(`Fullscreen error: ${err.message}`));
    } else {
        document.exitFullscreen();
    }
}

function toggleChat() {
    const chatBox = document.getElementById('chatBox');
    const showBtn = document.getElementById('floatingShowBtn');
    const chatMessages = document.getElementById('chat-messages');

    isChatVisible = !isChatVisible;
    if (isChatVisible) {
        chatBox.classList.remove('chat-hidden');
        showBtn.classList.remove('visible');
    } else {
        chatBox.classList.add('chat-hidden');
        showBtn.classList.add('visible');
        chatMessages.innerHTML = '';
    }
}

function toggleTheater() {
    isTheater = !isTheater;
    const body = document.body;
    const tBtn = document.getElementById('theaterBtn');

    if (isTheater) {
        body.classList.add('theater-mode');
        tBtn.innerText = "📺 Exit";
        tBtn.style.color = "#9146FF";
    } else {
        body.classList.remove('theater-mode');
        tBtn.innerText = "🎬 Theater";
        tBtn.style.color = "white";
    }
}

function changeQuality() {
    if (hls) hls.currentLevel = parseInt(qSelect.value);
}

function startPlayer(url) {
    if (Hls.isSupported()) {
        if (hls) hls.destroy();
        hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
            video.play();
            video.volume = document.getElementById('volumeSlider').value;

            qSelect.style.display = 'inline-block';
            qSelect.innerHTML = '<option value="-1">Auto</option>';
            data.levels.forEach((level, index) => {
                if (level.height) qSelect.innerHTML += `<option value="${index}">${level.height}p</option>`;
            });
            qSelect.value = "-1";
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                if (data.response && data.response.code === 404) {
                    alert("Этот канал сейчас оффлайн! Twitch отключил трансляцию.");
                }
                hls.destroy();
            }
        });

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url; video.play();
        qSelect.style.display = 'none';
    }
}

async function loadStream() {
    const channel = document.getElementById('channelName').value.toLowerCase().replace(/\s+/g, '');
    if (!channel) return;

    isAudioOnly = false;
    wrapper.classList.remove('audio-mode');
    audioBtn.innerText = "🎧 Audio Only";
    audioBtn.classList.remove('audio-btn-active');
    qSelect.disabled = false;

    startPlayer(`/api/m3u8?channel=${channel}`);
    initChat(channel);
}

async function toggleAudio() {
    const channel = document.getElementById('channelName').value.toLowerCase().replace(/\s+/g, '');
    if (!channel) return;

    if (isAudioOnly) {
        loadStream();
        return;
    }

    isAudioOnly = true;

    try {
        const res = await fetch(`/api/m3u8?channel=${channel}`);

        if (res.status === 404) {
            alert("Канал сейчас ОФФЛАЙН.");
            isAudioOnly = false;
            return;
        }

        const text = await res.text();
        const lines = text.split('\n');
        let audioUrl = null;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('audio_only') || lines[i].includes('GROUP-ID="audio"')) {
                const match = lines[i].match(/URI="([^"]+)"/);
                if (match) {
                    audioUrl = match[1];
                    break;
                }
                for (let j = i + 1; j <= i + 2; j++) {
                    if (lines[j] && lines[j].startsWith('http')) {
                        audioUrl = lines[j];
                        break;
                    }
                }
                if (audioUrl) break;
            }
        }
        if (audioUrl) {
            startPlayer(audioUrl);
            wrapper.classList.add('audio-mode');
            audioBtn.innerText = "📺 Return Video";
            audioBtn.classList.add('audio-btn-active');
            qSelect.disabled = true;
        } else {
            alert("Twitch did not provide an audio stream.");
            isAudioOnly = false;
        }
    } catch (e) {
        alert("Error switching mode.");
        isAudioOnly = false;
    }
}

function togglePlay() {
    if (video.paused) {
        video.play();
        document.getElementById('playPauseBtn').innerText = "⏸ Pause";
    } else {
        video.pause();
        document.getElementById('playPauseBtn').innerText = "▶ Play";
    }
}

function changeVolume() { video.volume = document.getElementById('volumeSlider').value; }

setInterval(() => {
    if (!video.paused && video.buffered.length > 0) {
        const liveEdge = video.buffered.end(video.buffered.length - 1);
        let latency = liveEdge - video.currentTime;
        if (latency < 0) latency = 0;

        syncBtn.innerText = `Latency: ${latency.toFixed(1)}s`;
        if (latency > 5) syncBtn.style.color = "#ff4a4a";
        else if (latency > 2.5) syncBtn.style.color = "#ffb347";
        else syncBtn.style.color = "#00ff00";
    } else {
        syncBtn.innerText = `Latency: -`;
        syncBtn.style.color = "white";
    }
}, 1000);

function syncToLive() {
    if (video.buffered.length > 0) {
        const liveEdge = video.buffered.end(video.buffered.length - 1);
        video.currentTime = liveEdge - 1;
        video.play();
    }
}

function initChat(channelName) {
    const chatContainer = document.getElementById('chat-messages');
    if (ws) ws.close();
    chatContainer.innerHTML = '<div style="color: gray; text-align: center; margin-top: 10px;">⏳ Connecting...</div>';

    ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    ws.onopen = () => {
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
        ws.send('PASS SCHMOOPIIE');
        ws.send(`NICK justinfan${Math.floor(Math.random() * 100000)}`);
        ws.send(`JOIN #${channelName}`);
        chatContainer.innerHTML += `<div style="color: #00ff00; text-align: center; margin-bottom: 10px;">✅ Chat connected</div>`;
    };

    ws.onmessage = (event) => {
        const lines = event.data.split('\r\n');
        lines.forEach(line => {
            if (!line) return;
            if (line.startsWith('PING')) ws.send('PONG :tmi.twitch.tv');
            else if (line.includes(' PRIVMSG ')) parseTwitchMessage(line);
        });
    };
}

function parseTwitchMessage(line) {
    if (!isChatVisible) return;

    const parts = line.split(' PRIVMSG ');
    if (parts.length < 2) return;
    const tagsPart = parts[0], messagePart = parts[1];
    const message = messagePart.substring(messagePart.indexOf(':') + 1);

    let username = "User", color = "#9146FF", badges = [];

    if (tagsPart.startsWith('@')) {
        const tagsString = tagsPart.substring(1, tagsPart.indexOf(' :'));
        tagsString.split(';').forEach(t => {
            const [key, val] = t.split('=');
            if (key === 'display-name' && val) username = val;
            if (key === 'color' && val) color = val;
            if (key === 'badges' && val) {
                val.split(',').forEach(badge => {
                    badges.push(badge.split('/')[0]);
                });
            }
        });
    }

    renderChatMessage(username, color, message, badges);
}

function renderChatMessage(username, color, message, badges) {
    const chatContainer = document.getElementById('chat-messages');
    const isScrolledToBottom = Math.ceil(chatContainer.scrollTop + chatContainer.clientHeight) >= (chatContainer.scrollHeight - 50);

    const words = message.split(' ');
    const renderedMessage = words.map(word => {
        if (word.startsWith('http://') || word.startsWith('https://')) {
            const safeUrl = escapeHtml(word);
            return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="chat-link">${safeUrl}</a>`;
        }
        return escapeHtml(word);
    }).join(' ');

    const globalBadges = {
        broadcaster: "https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/1",
        moderator: "https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41ea1d0/1",
        vip: "https://static-cdn.jtvnw.net/badges/v1/b817aba4-fad8-49e2-b88a-7cc744dfa6ec/1",
        premium: "https://static-cdn.jtvnw.net/badges/v1/bbbe0db0-a598-423e-86d0-f9fb98ca1933/1",
        founder: "https://static-cdn.jtvnw.net/badges/v1/511b78a9-ab37-472f-9569-457753bbe8d3/1",
        subscriber: "https://static-cdn.jtvnw.net/badges/v1/5d9f2208-5dd8-11e7-8513-2ff4adfae661/1",
        turbo: "https://static-cdn.jtvnw.net/badges/v1/bd444ec6-8f34-4bf9-91f4-af1e3428d80f/1",
        partner: "https://static-cdn.jtvnw.net/badges/v1/d12a2e27-16f6-41d0-ab77-b780518f00a3/1"
    };

    let badgesHtml = '';
    if (badges && badges.length > 0) {
        badges.forEach(badge => {
            if (globalBadges[badge]) {
                badgesHtml += `<img class="chat-badge" src="${globalBadges[badge]}" title="${badge}" alt="${badge}">`;
            }
        });
    }

    const msgElement = document.createElement('div');
    msgElement.className = 'chat-message'; // Убрана анимация
    msgElement.innerHTML = `${badgesHtml}<span class="chat-username" style="color: ${color}">${escapeHtml(username)}:</span> <span class="chat-text">${renderedMessage}</span>`;

    chatContainer.appendChild(msgElement);

    if (isScrolledToBottom) {
        while (chatContainer.childElementCount > 50) { // Снизили лимит сообщений в памяти до 50
            chatContainer.removeChild(chatContainer.firstChild);
        }
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Первичный запуск
loadStream();