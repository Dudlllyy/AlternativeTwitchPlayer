const video = document.getElementById('video');
const wrapper = document.getElementById('player-wrapper');
const audioBtn = document.getElementById('audioToggleBtn');
const syncBtn = document.getElementById('syncLiveBtn');
const qSelect = document.getElementById('qualitySelect');

let hls;
let userHistory = {};
let isAudioOnly = false;
let isChatVisible = true;
let isTheater = false;
let infoInterval;
let pubsubSocket;
let localPoll = {
    isActive: false,
    question: "",
    options: {},     
    votedUsers: new Set() 
};

let widgetStates = {
    local: false,
    poll: false,
    prediction: false
};


function toggleWidgetState(type) {
    widgetStates[type] = !widgetStates[type];

    if (type === 'local') updateLocalPollUI();
    const el = document.getElementById(`widget-${type}`);
    if (el) el.classList.toggle('expanded');
}
function startLocalPoll(question, optionsArray) {
    localPoll.isActive = true;
    localPoll.question = question;
    localPoll.options = {};
    localPoll.votedUsers.clear();


    optionsArray.forEach((optionTitle, index) => {
        localPoll.options[index + 1] = {
            title: optionTitle,
            votes: 0
        };
    });

    console.log(`Опрос запущен: ${question}`);
    updateLocalPollUI(); 
}


async function fetchInitialEvents(channelLogin) {
    try {

        const query = `
        query {
            user(login: "${channelLogin}") {
                channel {
                    prediction {
                        title
                        status
                        outcomes {
                            title
                            color
                            totalPoints
                        }
                    }
                }
            }
        }`;

        const res = await fetch('https://gql.twitch.tv/gql', {
            method: 'POST',
            headers: {
                'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });

        const data = await res.json();
        const prediction = data.data?.user?.channel?.prediction;


        if (prediction && (prediction.status === 'ACTIVE' || prediction.status === 'LOCKED')) {


            const formattedData = {
                type: 'event-updated',
                event: {
                    title: prediction.title,
                    status: prediction.status,
                    outcomes: prediction.outcomes.map(o => ({
                        title: o.title,
                        color: o.color,
                        total_points: o.totalPoints || 0
                    }))
                }
            };

            renderPrediction(formattedData, document.getElementById('events-overlay'));
        }
    } catch (e) {
        console.log("GraphQL Initial fetch failed, waiting for socket updates...", e);
    }
}

async function initEventsOverlay(channel) {
    const overlay = document.getElementById('events-overlay');
    if (!overlay) return;

    overlay.innerHTML = '';
    overlay.style.display = 'none';

    try {
        fetchInitialEvents(channel);

        const idRes = await fetch(`https://decapi.me/twitch/id/${channel}`);
        const channelId = await idRes.text();

        if (channelId.includes('User not found')) return;


        if (pubsubSocket) pubsubSocket.close();
        pubsubSocket = new WebSocket('wss://pubsub-edge.twitch.tv');

        pubsubSocket.onopen = () => {

            setInterval(() => pubsubSocket.send(JSON.stringify({ type: 'PING' })), 1000 * 60 * 4);


            const listenMessage = {
                type: 'LISTEN',
                nonce: Math.random().toString(36).substring(2),
                data: {
                    topics: [
                        `predictions-channel-v1.${channelId}`,
                        `polls-v1.${channelId}`
                    ],
                    auth_token: "" 
                }
            };
            pubsubSocket.send(JSON.stringify(listenMessage));
        };

        pubsubSocket.onmessage = (event) => {
            const response = JSON.parse(event.data);
            if (response.type !== 'MESSAGE') return;

            const topic = response.data.topic;
            const messageData = JSON.parse(response.data.message);

            if (topic.startsWith('predictions')) {
                renderPrediction(messageData, overlay);
            } else if (topic.startsWith('polls')) {
                renderPoll(messageData, overlay);
            }
        };
    } catch (e) {
        console.log('Ошибка загрузки оверлея событий:', e);
    }
}


function renderPrediction(data, container) {
    const eventType = data.type; 
    const prediction = data.event;


    if (eventType === 'event-status-update' && (prediction.status === 'RESOLVED' || prediction.status === 'CANCELED')) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    let html = `<div style="font-size: 13px; font-weight: bold; color: #adadb8;">🔮 СТАВКА: ${prediction.title}</div>`;

    let totalPoints = prediction.outcomes.reduce((sum, o) => sum + o.total_points, 0);
    totalPoints = totalPoints === 0 ? 1 : totalPoints; 

    html += `<div style="display: flex; gap: 8px; margin-top: 5px;">`;
    prediction.outcomes.forEach(outcome => {
        const percent = Math.round((outcome.total_points / totalPoints) * 100);

        const color = outcome.color === 'BLUE' ? '#387aff' : '#f5009b';

        html += `
            <div style="flex: 1; background: #26262c; padding: 6px 8px; border-radius: 4px; border-top: 3px solid ${color};">
                <div style="font-size: 13px; color: white;">${outcome.title}</div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px;">
                    <span style="color: #adadb8;">${percent}%</span>
                    <span style="color: ${color}; font-weight: bold;">${outcome.total_points.toLocaleString()} баллов</span>
                </div>
            </div>
        `;
    });
    html += `</div>`;

    container.innerHTML = html;
}


function renderPoll(data, container) {
    const eventType = data.type;
    const poll = data.poll;


    if (eventType === 'POLL_COMPLETE' || eventType === 'POLL_ARCHIVE') {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    let html = `<div style="font-size: 13px; font-weight: bold; color: #adadb8; margin-bottom: 5px;">📊 ОПРОС: ${poll.title}</div>`;

    let totalVotes = poll.choices.reduce((sum, c) => sum + c.votes.total, 0);
    totalVotes = totalVotes === 0 ? 1 : totalVotes;

    poll.choices.forEach(choice => {
        const percent = Math.round((choice.votes.total / totalVotes) * 100);
        html += `
            <div style="position: relative; background: #26262c; border-radius: 4px; overflow: hidden; padding: 6px 10px;">
                <div style="position: absolute; left: 0; top: 0; bottom: 0; width: ${percent}%; background: rgba(145, 70, 255, 0.25); z-index: 1; transition: width 0.5s;"></div>
                
                <div style="position: relative; z-index: 2; display: flex; justify-content: space-between; font-size: 13px;">
                    <span style="color: white;">${choice.title}</span>
                    <span style="color: #adadb8; font-weight: bold;">${percent}% <span style="font-weight: normal; font-size: 11px;">(${choice.votes.total.toLocaleString()})</span></span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

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


    isChatVisible = !isChatVisible;
    if (isChatVisible) {
        chatBox.classList.remove('chat-hidden');
        showBtn.classList.remove('visible');
    } else {
        chatBox.classList.add('chat-hidden');
        showBtn.classList.add('visible');

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

    if (hasDragged) return;

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
        <button class="fav-btn" id="fav-btn-${channel}" onclick="loadFavorite('${channel}')">
            <span class="fav-status-dot" id="fav-dot-${channel}"></span>
            <span style="font-weight: bold;">${channel}</span>
            <span class="fav-viewers" id="fav-viewers-${channel}"></span>
            <span class="delete-fav" title="Remove" onclick="removeFavorite('${channel}', event)">✖</span>
        </button>
    `).join('');


    favs.forEach(channel => checkFavoriteStatus(channel));
}

async function checkFavoriteStatus(channel) {
    try {

        const res = await fetch(`/api/live_status?channel=${channel}`);
        const text = await res.text();

        const dot = document.getElementById(`fav-dot-${channel}`);
        const viewers = document.getElementById(`fav-viewers-${channel}`);

        if (!dot || !viewers) return;

        if (text.toLowerCase().includes('offline')) {
            dot.classList.add('offline');
            dot.classList.remove('live');
            viewers.innerText = '';
        } else {
            dot.classList.add('live');
            dot.classList.remove('offline');
            viewers.innerText = `👁 ${text.trim()}`;
        }
    } catch (e) {
        console.log(`Failed to check status for ${channel}`);
    }
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
                    const channel = document.getElementById('channelName').value.trim();
                    document.getElementById('streamTitleText').innerText = "❌ Стрим оффлайн";
                    showOfflineModal(channel); 
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

    document.getElementById('streamTitleText').innerText = "Loading info...";
    document.getElementById('streamViewersCount').innerText = "👁 0";


    try {
        const decapiRes = await fetch(`/api/live_status?channel=${channel}`);
        const text = await decapiRes.text();

        if (text.toLowerCase().includes('offline')) {
            document.getElementById('streamTitleText').innerText = "❌ Channel Offline";
            document.getElementById('streamViewersCount').innerText = "";
            if (hls) hls.destroy();
            showOfflineModal(channel);
            return; 
        }
    } catch (e) {
        console.log("Live status check skipped, playing stream directly...");
    }


    startPlayer(`/api/m3u8?channel=${channel}`);
    initChat(channel);
    initEventsOverlay(channel);

    fetchStreamInfo(channel);
    if (infoInterval) clearInterval(infoInterval);
    infoInterval = setInterval(() => fetchStreamInfo(channel), 60000);
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
            showOfflineModal(channel); 
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
            showOfflineModal(channel); 
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


function updateLocalPollUI() {
    const container = document.getElementById('events-overlay');
    if (!container || !localPoll.isActive) return;

    container.style.display = 'block';

    let totalVotes = Object.values(localPoll.options).reduce((sum, opt) => sum + opt.votes, 0);
    let total = totalVotes === 0 ? 1 : totalVotes;


    let compactStatsText = Object.keys(localPoll.options).map(key => {
        let percent = Math.round((localPoll.options[key].votes / total) * 100);
        return `<span style="margin-right: 8px;">[${key}] ${percent}%</span>`;
    }).join(' • ');


    const expandedClass = widgetStates.local ? 'expanded' : '';

    let html = `
        <div class="event-widget ${expandedClass}" id="widget-local">
            <!-- КРАСНАЯ ЗОНА (Кликабельная) -->
            <div class="event-summary" onclick="toggleWidgetState('local')">
                <div class="event-summary-info">
                    <div class="event-header poll">📊 Локальный: ${escapeHtml(localPoll.question)}</div>
                    <div class="event-compact-stats">${compactStatsText}</div>
                </div>
                <div class="event-toggle-btn">▼</div>
            </div>

            <!-- ЖЕЛТАЯ ЗОНА (Детали) -->
            <div class="event-details">
    `;

    Object.keys(localPoll.options).forEach(key => {
        const option = localPoll.options[key];
        const percent = Math.round((option.votes / total) * 100);

        html += `
                <div class="poll-option">
                    <div class="poll-progress" style="width: ${percent}%;"></div>
                    <div class="poll-content">
                        <span class="poll-title"><span style="color:#bf94ff; margin-right:4px;">[${key}]</span> ${escapeHtml(option.title)}</span>
                        <div class="poll-stats">
                            <span class="poll-percent">${percent}%</span>
                            <span class="poll-votes">(${option.votes})</span>
                        </div>
                    </div>
                </div>
        `;
    });

    html += `
                <div style="font-size: 11px; color: #adadb8; text-align: right; margin-top: 6px;">Всего голосов: ${totalVotes}</div>
            </div>
        </div>
    `;
    container.innerHTML = html;
}


function renderPrediction(data, container) {
    const eventType = data.type;
    const prediction = data.event;

    if (eventType === 'event-status-update' && (prediction.status === 'RESOLVED' || prediction.status === 'CANCELED')) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    let totalPoints = prediction.outcomes.reduce((sum, o) => sum + o.total_points, 0);
    totalPoints = totalPoints === 0 ? 1 : totalPoints;

    let compactStatsText = prediction.outcomes.map(o => {
        const percent = Math.round((o.total_points / totalPoints) * 100);
        const icon = o.color === 'BLUE' ? '🟦' : '🟪';
        return `${icon} ${percent}%`;
    }).join(' • ');

    const expandedClass = widgetStates.prediction ? 'expanded' : '';

    let html = `
        <div class="event-widget ${expandedClass}" id="widget-prediction">
            <div class="event-summary" onclick="toggleWidgetState('prediction')">
                <div class="event-summary-info">
                    <div class="event-header prediction">🔮 Ставка: ${escapeHtml(prediction.title)}</div>
                    <div class="event-compact-stats">${compactStatsText}</div>
                </div>
                <div class="event-toggle-btn">▼</div>
            </div>

            <div class="event-details">
                <div class="pred-container">
    `;

    prediction.outcomes.forEach(outcome => {
        const percent = Math.round((outcome.total_points / totalPoints) * 100);
        const isBlue = outcome.color === 'BLUE';
        const cardClass = isBlue ? 'blue' : 'pink';
        const colorHex = isBlue ? '#387aff' : '#f5009b';


        const multiplier = outcome.total_points > 0 ? (totalPoints / outcome.total_points).toFixed(2) : "1.00";

        html += `
                    <div class="pred-card ${cardClass}">
                        <div class="pred-title">${escapeHtml(outcome.title)}</div>
                        <div class="pred-info">
                            <span style="color: #adadb8; font-size: 12px;">${percent}% голосов</span>
                            <span style="color: ${colorHex}; font-weight: bold;">${outcome.total_points.toLocaleString()} pts</span>
                            <span class="pred-multiplier">Коэфф. 1:${multiplier}</span>
                        </div>
                    </div>
        `;
    });

    html += `
                </div>
                <div style="font-size: 11px; color: #adadb8; text-align: right; margin-top: 8px;">Общий банк: ${totalPoints.toLocaleString()}</div>
            </div>
        </div>`;
    container.innerHTML = html;
}


function renderPoll(data, container) {
    const eventType = data.type;
    const poll = data.poll;

    if (eventType === 'POLL_COMPLETE' || eventType === 'POLL_ARCHIVE') {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    let totalVotes = poll.choices.reduce((sum, c) => sum + c.votes.total, 0);
    totalVotes = totalVotes === 0 ? 1 : totalVotes;

    let compactStatsText = poll.choices.slice(0, 2).map(c => {
        return `${Math.round((c.votes.total / totalVotes) * 100)}%`;
    }).join(' • ') + (poll.choices.length > 2 ? ' ...' : '');

    const expandedClass = widgetStates.poll ? 'expanded' : '';

    let html = `
        <div class="event-widget ${expandedClass}" id="widget-poll">
            <div class="event-summary" onclick="toggleWidgetState('poll')">
                <div class="event-summary-info">
                    <div class="event-header poll">📊 Опрос: ${escapeHtml(poll.title)}</div>
                    <div class="event-compact-stats">Лидеры: ${compactStatsText}</div>
                </div>
                <div class="event-toggle-btn">▼</div>
            </div>

            <div class="event-details">
    `;

    poll.choices.forEach(choice => {
        const percent = Math.round((choice.votes.total / totalVotes) * 100);
        html += `
                <div class="poll-option">
                    <div class="poll-progress" style="width: ${percent}%;"></div>
                    <div class="poll-content">
                        <span class="poll-title">${escapeHtml(choice.title)}</span>
                        <div class="poll-stats">
                            <span class="poll-percent">${percent}%</span>
                            <span class="poll-votes">(${choice.votes.total.toLocaleString()})</span>
                        </div>
                    </div>
                </div>
        `;
    });

    html += `
                <div style="font-size: 11px; color: #adadb8; text-align: right; margin-top: 6px;">Всего: ${totalVotes}</div>
            </div>
        </div>
    `;
    container.innerHTML = html;
}


function stopLocalPoll() {
    localPoll.isActive = false;
    document.getElementById('events-overlay').style.display = 'none';
}

function parseTwitchMessage(line) {


    const parts = line.split(' PRIVMSG ');
    if (parts.length < 2) return;
    const tagsPart = parts[0], messagePart = parts[1];
    const message = messagePart.substring(messagePart.indexOf(':') + 1);

    let username = "User", color = "#9146FF", emotes = {}, badges = [];
    let isFirstMsg = false;
    let isHighlighted = false;

    if (tagsPart.startsWith('@')) {
        const tagsString = tagsPart.substring(1, tagsPart.indexOf(' :'));
        tagsString.split(';').forEach(t => {
            const [key, val] = t.split('=');
            if (key === 'display-name' && val) username = val;
            if (key === 'color' && val) color = val;
            if (key === 'first-msg' && val === '1') isFirstMsg = true;
            if (key === 'msg-id' && val === 'highlighted-message') isHighlighted = true;

            if (key === 'badges' && val) {
                val.split(',').forEach(badge => {
                    badges.push(badge.split('/')[0]);
                });
            }

            if (key === 'emotes' && val) {
                val.split('/').forEach(emote => {
                    const [id, positions] = emote.split(':');
                    emotes[id] = positions.split(',');
                });
            }
        });
    }


    if (localPoll.isActive) {
        const vote = message.trim(); 

        if (localPoll.options[vote] && !localPoll.votedUsers.has(username)) {
            localPoll.options[vote].votes += 1;
            localPoll.votedUsers.add(username);
            updateLocalPollUI();
        }
    }

    renderChatMessage(username, color, message, emotes, badges, isFirstMsg, isHighlighted);
}

function renderChatMessage(username, color, message, emotes, badges, isFirstMsg, isHighlighted) {
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

        if (word.startsWith('http://') || word.startsWith('https://')) {
            const safeUrl = escapeHtml(word);
            return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="chat-link">${safeUrl}</a>`;
        }

        return escapeHtml(word);
    }).join(' ');

    const globalBadges = {
        broadcaster: "https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/1",
        moderator: "https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/1",
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

    let extraClasses = '';
    let topBadgeHtml = '';

    if (isHighlighted) {
        extraClasses = ' msg-highlighted';
        topBadgeHtml = `<div class="msg-top-badge badge-highlighted">🌟 Highlighted Message</div>`;
    } else if (isFirstMsg) {
        extraClasses = ' msg-first-time';
        topBadgeHtml = `<div class="msg-top-badge badge-first-time">👋 First Time Chatter</div>`;
    }

    const msgElement = document.createElement('div');
    msgElement.className = `chat-message new-message-animation${extraClasses}`;


    msgElement.innerHTML = `${topBadgeHtml}<div>${badgesHtml}<span class="chat-username" style="color: ${color}" onclick="openUserHistory('${escapeHtml(username)}', '${color}')">${escapeHtml(username)}:</span> <span class="chat-text">${renderedMessage}</span></div>`;


    const cleanUser = username.toLowerCase();
    if (!userHistory[cleanUser]) userHistory[cleanUser] = [];
    userHistory[cleanUser].push(renderedMessage);

    if (userHistory[cleanUser].length > 30) {
        userHistory[cleanUser].shift();
    }

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
let hasDragged = false;

slider.addEventListener('mousedown', (e) => {
    isDown = true;
    hasDragged = false; 
    slider.classList.add('active');
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
});

slider.addEventListener('mouseleave', () => {
    isDown = false;
    slider.classList.remove('active');
});

slider.addEventListener('mouseup', () => {
    isDown = false;
    slider.classList.remove('active');

});

slider.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 1.5;

    if (Math.abs(walk) > 5) {
        hasDragged = true;
    }

    slider.scrollLeft = scrollLeft - walk;
});


const userModal = document.getElementById('userHistoryModal');
const modalHeader = document.getElementById('modalHeader');
const modalBody = document.getElementById('modalBody');
const modalTitle = document.getElementById('modalTitle');

let isDraggingModal = false;
let dragOffsetX, dragOffsetY;


modalHeader.addEventListener('mousedown', (e) => {
    e.preventDefault()
    isDraggingModal = true;
    dragOffsetX = e.clientX - userModal.getBoundingClientRect().left;
    dragOffsetY = e.clientY - userModal.getBoundingClientRect().top;
});


document.addEventListener('mousemove', (e) => {
    if (!isDraggingModal) return;


    let newX = e.clientX - dragOffsetX;
    let newY = e.clientY - dragOffsetY;

    if (newX < 0) newX = 0;
    if (newY < 0) newY = 0;

    userModal.style.left = `${newX}px`;
    userModal.style.top = `${newY}px`;
});


document.addEventListener('mouseup', () => {
    isDraggingModal = false;
});


function openUserHistory(username, color) {
    const cleanUser = username.toLowerCase();
    const history = userHistory[cleanUser] || [];

    modalTitle.innerText = `History: ${username}`;
    modalTitle.style.color = color;

    if (history.length === 0) {
        modalBody.innerHTML = '<span style="color: gray;">No recent messages found.</span>';
    } else {

        modalBody.innerHTML = history.map(msg => `<div class="history-msg">${msg}</div>`).join('');
    }


    userModal.style.top = '20%';
    userModal.style.left = '40%';
    userModal.classList.remove('hidden');

    modalBody.scrollTop = modalBody.scrollHeight;
}

function closeUserHistory() {
    userModal.classList.add('hidden');
}

const offlineModal = document.getElementById('offlineModal');
const offlineChannelName = document.getElementById('offlineChannelName');
let currentOfflineChannel = "";

function showOfflineModal(channel) {
    currentOfflineChannel = channel;
    offlineChannelName.innerText = channel;
    offlineModal.classList.remove('hidden');
}

function closeOfflineModal() {
    offlineModal.classList.add('hidden');
}

function goToVods() {

    window.location.href = `vods.html?channel=${currentOfflineChannel}`;
}




const chatMessagesContainer = document.getElementById('chat-messages');
const scrollToBottomBtn = document.getElementById('scrollToBottomBtn');


chatMessagesContainer.addEventListener('scroll', () => {

    const isAtBottom = Math.ceil(chatMessagesContainer.scrollTop + chatMessagesContainer.clientHeight) >= (chatMessagesContainer.scrollHeight - 120);

    if (isAtBottom) {
        scrollToBottomBtn.classList.add('hidden'); 
    } else {
        scrollToBottomBtn.classList.remove('hidden'); 
    }
});

function scrollToBottom() {
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    scrollToBottomBtn.classList.add('hidden');
}

function fireUIPoll() {
    const question = document.getElementById('pollQuestion').value;

    const options = document.getElementById('pollOptions').value.split(',').map(s => s.trim());

    if (question && options.length > 1) {
        startLocalPoll(question, options);
    } else {
        alert("Заполни вопрос и минимум два варианта!");
    }
}

// ==========================================
// ЛОГИКА КНОПКИ РАЗРАБОТЧИКА
// ==========================================
function toggleDevPanel() {
    const panel = document.getElementById('dev-poll-panel');
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
    }
}

renderFavorites();
fetchGlobal7TV();
loadStream();

// ==========================================
// ПЛАВНОЕ ПЕРЕТАСКИВАНИЕ И АВТО-СКРОЛЛ ИЗБРАННОГО
// ==========================================
const favPanel = document.getElementById('favorites-panel');

if (favPanel) {
    new Sortable(favPanel, {
        animation: 250,
        draggable: '.fav-btn',
        filter: '.delete-fav',


        forceFallback: true,
        fallbackOnBody: true,
        fallbackClass: 'fav-dragging',
        ghostClass: 'fav-ghost',


        scroll: favPanel,
        scrollSensitivity: 85,
        scrollSpeed: 25,
        bubbleScroll: true,

        onEnd: function () {
            const newOrder = [];
            document.querySelectorAll('#favorites-panel .fav-btn').forEach(btn => {
                const channel = btn.id.replace('fav-btn-', '');
                newOrder.push(channel);
            });
            localStorage.setItem('twitch_favs', JSON.stringify(newOrder));
        }
    });
}
