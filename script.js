const video = document.getElementById('video');
const wrapper = document.getElementById('player-wrapper');
const audioBtn = document.getElementById('audioToggleBtn');
const syncBtn = document.getElementById('syncLiveBtn');
const qSelect = document.getElementById('qualitySelect');

let hls;
let isAudioOnly = false;
let isChatVisible = true;
let isTheater = false;
let infoInterval;


function toggleFullscreen() {
    if (!document.fullscreenElement) {
        wrapper.requestFullscreen().catch(err => alert(`Fullscreen error: ${err.message}`));
    } else {
        document.exitFullscreen();
    }
}


async function fetchStreamInfo(channel) {
    try {
        const titleRes = await fetch(`https://decapi.me/twitch/title/${channel}`);
        const viewersRes = await fetch(`https://decapi.me/twitch/viewercount/${channel}`);

        const title = await titleRes.text();
        const viewers = await viewersRes.text();

        if (title.includes('offline') || viewers.includes('offline')) {
            document.getElementById('streamTitleText').innerText = "Channel Offline";
            document.getElementById('streamViewersCount').innerText = "";
        } else {
            document.getElementById('streamTitleText').innerText = title;
            document.getElementById('streamViewersCount').innerText = `👁 ${viewers}`;
        }
    } catch (e) {
        console.log("Error loading stream info");
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


function saveFavorite() {
    const channel = document.getElementById('channelName').value.toLowerCase().trim();
    if (!channel) return;
    let favs = JSON.parse(localStorage.getItem('twitch_favs') || '[]');
    if (!favs.includes(channel)) {
        favs.push(channel);
        localStorage.setItem('twitch_favs', JSON.stringify(favs));
        renderFavorites();
    }
}

function removeFavorite(channel, event) {
    event.stopPropagation();
    let favs = JSON.parse(localStorage.getItem('twitch_favs') || '[]');
    favs = favs.filter(c => c !== channel);
    localStorage.setItem('twitch_favs', JSON.stringify(favs));
    renderFavorites();
}

function loadFavorite(channel) {
    document.getElementById('channelName').value = channel;
    loadStream();
}

function renderFavorites() {
    const panel = document.getElementById('favorites-panel');
    let favs = JSON.parse(localStorage.getItem('twitch_favs') || '[]');
    if (favs.length === 0) {
        panel.innerHTML = '<span style="color: gray; font-size: 14px; margin: 0 auto;">Your favorite channels will appear here</span>';
        return;
    }
    panel.innerHTML = favs.map(channel => `
        <button class="fav-btn" onclick="loadFavorite('${channel}')">
            📺 ${channel}
            <span class="delete-fav" title="Remove" onclick="removeFavorite('${channel}', event)">✖</span>
        </button>
    `).join('');
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
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url; video.play();
        qSelect.style.display = 'none';
    }
}

function loadStream() {
    const channel = document.getElementById('channelName').value.toLowerCase().trim();
    if (!channel) return;

    if (isAudioOnly) {
        isAudioOnly = false;
        wrapper.classList.remove('audio-mode');
        audioBtn.innerText = "🎧 Audio Only";
        audioBtn.classList.remove('audio-btn-active');
        qSelect.disabled = false;
    }

    startPlayer(`/api/m3u8?channel=${channel}`);
    initChat(channel);

    document.getElementById('streamTitleText').innerText = "Loading info...";
    document.getElementById('streamViewersCount').innerText = "👁 0";
    fetchStreamInfo(channel);
    if (infoInterval) clearInterval(infoInterval);
    infoInterval = setInterval(() => fetchStreamInfo(channel), 60000);
}


async function toggleAudio() {
    const channel = document.getElementById('channelName').value.toLowerCase().trim();
    if (!channel) return;
    isAudioOnly = !isAudioOnly;

    if (isAudioOnly) {
        try {
            const response = await fetch(`/api/m3u8?channel=${channel}`);
            const text = await response.text();
            const lines = text.split('\n');
            let audioUrl = null;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('audio_only')) {
                    for (let j = i + 1; j <= i + 2; j++) {
                        if (lines[j] && lines[j].startsWith('http')) { audioUrl = lines[j]; break; }
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
            } else { alert("Twitch did not provide an audio stream."); isAudioOnly = false; }
        } catch (e) { alert("Error switching mode."); isAudioOnly = false; }
    } else {
        startPlayer(`/api/m3u8?channel=${channel}`);
        wrapper.classList.remove('audio-mode');
        audioBtn.innerText = "🎧 Audio Only";
        audioBtn.classList.remove('audio-btn-active');
        qSelect.disabled = false;
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


let ws = null;
let global7TVEmotes = {};
let channel7TVEmotes = {};

function escapeHtml(unsafe) { return String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

async function fetchGlobal7TV() {
    try {
        const res = await fetch('https://7tv.io/v3/emote-sets/global');
        const data = await res.json();
        if (data.emotes) data.emotes.forEach(e => { global7TVEmotes[e.name] = `https://cdn.7tv.app/emote/${e.id}/1x.webp`; });
    } catch(e) {}
}

async function fetchChannel7TV(twitchId) {
    channel7TVEmotes = {};
    try {
        const res = await fetch(`https://7tv.io/v3/users/twitch/${twitchId}`);
        if (res.ok) {
            const data = await res.json();
            if (data.emote_set && data.emote_set.emotes) {
                data.emote_set.emotes.forEach(e => { channel7TVEmotes[e.name] = `https://cdn.7tv.app/emote/${e.id}/1x.webp`; });
            }
        }
    } catch(e) {}
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
            else if (line.includes(' ROOMSTATE ')) {
                const match = line.match(/room-id=(\d+)/);
                if (match && match[1]) fetchChannel7TV(match[1]);
            }
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
    let username = "User", color = "#9146FF", emotes = {};

    if (tagsPart.startsWith('@')) {
        const tagsString = tagsPart.substring(1, tagsPart.indexOf(' :'));
        tagsString.split(';').forEach(t => {
            const [key, val] = t.split('=');
            if (key === 'display-name' && val) username = val;
            if (key === 'color' && val) color = val;
            if (key === 'emotes' && val) {
                val.split('/').forEach(emote => {
                    const [id, positions] = emote.split(':');
                    emotes[id] = positions.split(',');
                });
            }
        });
    }
    renderChatMessage(username, color, message, emotes);
}

function renderChatMessage(username, color, message, emotes) {
    const chatContainer = document.getElementById('chat-messages');


    const isScrolledToBottom = Math.ceil(chatContainer.scrollTop + chatContainer.clientHeight) >= (chatContainer.scrollHeight - 50);

    let twitchEmotes = {};
    for (const [id, positions] of Object.entries(emotes)) {
        const [start, end] = positions[0].split('-');
        const word = message.substring(parseInt(start), parseInt(end) + 1);
        twitchEmotes[word] = `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/1.0`;
    }

    const words = message.split(' ');
    const renderedMessage = words.map(word => {
        if (channel7TVEmotes[word]) return `<img class="chat-emote" src="${channel7TVEmotes[word]}" title="${word}">`;
        if (global7TVEmotes[word]) return `<img class="chat-emote" src="${global7TVEmotes[word]}" title="${word}">`;
        if (twitchEmotes[word]) return `<img class="chat-emote" src="${twitchEmotes[word]}" title="${word}">`;
        return escapeHtml(word);
    }).join(' ');


    const msgElement = document.createElement('div');
    msgElement.className = 'chat-message new-message-animation';
    msgElement.innerHTML = `<span class="chat-username" style="color: ${color}">${escapeHtml(username)}:</span> <span class="chat-text">${renderedMessage}</span>`;


    chatContainer.appendChild(msgElement);

    if (isScrolledToBottom) {
        while (chatContainer.childElementCount > 200) {
            chatContainer.removeChild(chatContainer.firstChild);
        }
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}


const slider = document.getElementById('favorites-panel');
let isDown = false;
let startX;
let scrollLeft;

slider.addEventListener('mousedown', (e) => {
    isDown = true;
    slider.classList.add('active');
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
});
slider.addEventListener('mouseleave', () => { isDown = false; slider.classList.remove('active'); });
slider.addEventListener('mouseup', () => { isDown = false; slider.classList.remove('active'); });
slider.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 1.5;
    slider.scrollLeft = scrollLeft - walk;
});


renderFavorites();
fetchGlobal7TV();
loadStream();
