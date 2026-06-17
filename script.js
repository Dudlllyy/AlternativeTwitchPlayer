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
    // Если мы только что листали список, игнорируем клик и ничего не переключаем
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

    // Сначала быстро рендерим все кнопки с "серой" точкой загрузки
    panel.innerHTML = favs.map(channel => `
        <button class="fav-btn" id="fav-btn-${channel}" onclick="loadFavorite('${channel}')">
            <span class="fav-status-dot" id="fav-dot-${channel}"></span>
            <span style="font-weight: bold;">${channel}</span>
            <span class="fav-viewers" id="fav-viewers-${channel}"></span>
            <span class="delete-fav" title="Remove" onclick="removeFavorite('${channel}', event)">✖</span>
        </button>
    `).join('');

    // Затем асинхронно запускаем проверку онлайна для каждого канала в списке
    favs.forEach(channel => checkFavoriteStatus(channel));
}

async function checkFavoriteStatus(channel) {
    try {
        // Используем тот же легкий эндпоинт, что и для основного плеера
        const res = await fetch(`https://decapi.me/twitch/viewercount/${channel}`);
        const text = await res.text();

        // Находим элементы конкретно этой кнопки
        const dot = document.getElementById(`fav-dot-${channel}`);
        const viewers = document.getElementById(`fav-viewers-${channel}`);

        // Если пользователь успел удалить закладку до завершения запроса - прерываем
        if (!dot || !viewers) return;

        if (text.toLowerCase().includes('offline')) {
            dot.classList.add('offline');
            dot.classList.remove('live');
            viewers.innerText = ''; // Скрываем зрителей, если оффлайн
        } else {
            dot.classList.add('live');
            dot.classList.remove('offline');
            viewers.innerText = `👁 ${text}`; // Показываем зрителей
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

        // УМНЫЙ ПЕРЕХВАТ ОШИБОК
        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                if (data.response && data.response.code === 404) {
                    document.getElementById('streamTitleText').innerText = "❌ Стрим сейчас ОФФЛАЙН";
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

    // ПРИНУДИТЕЛЬНО сбрасываем аудиоплеер в обычный видео-режим при любой новой загрузке
    isAudioOnly = false;
    wrapper.classList.remove('audio-mode');
    audioBtn.innerText = "🎧 Audio Only";
    audioBtn.classList.remove('audio-btn-active');
    qSelect.disabled = false;

    document.getElementById('streamTitleText').innerText = "Loading info...";
    document.getElementById('streamViewersCount').innerText = "👁 0";

    // Скармливаем HLS.js ссылку на НАШ локальный сервер
    startPlayer(`/api/m3u8?channel=${channel}`);

    initChat(channel);
    fetchStreamInfo(channel);
    if (infoInterval) clearInterval(infoInterval);
    infoInterval = setInterval(() => fetchStreamInfo(channel), 60000);
}


async function toggleAudio() {
    const channel = document.getElementById('channelName').value.toLowerCase().replace(/\s+/g, '');
    if (!channel) return;

    // Если мы УЖЕ в режиме аудио, просто загружаем обычный стрим (он сам сбросит все классы)
    if (isAudioOnly) {
        loadStream();
        return;
    }

    // Иначе включаем режим аудио
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

    let username = "User", color = "#9146FF", emotes = {}, badges = [];
    let isFirstMsg = false;
    let isHighlighted = false;

    if (tagsPart.startsWith('@')) {
        const tagsString = tagsPart.substring(1, tagsPart.indexOf(' :'));
        tagsString.split(';').forEach(t => {
            const [key, val] = t.split('=');
            if (key === 'display-name' && val) username = val;
            if (key === 'color' && val) color = val;

            // Проверяем на первое сообщение в чате
            if (key === 'first-msg' && val === '1') isFirstMsg = true;

            // Проверяем на выделенное сообщение (за баллы канала)
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

    // Передаем новые флаги в функцию рендера
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

    // Определяем, нужно ли добавлять спец-оформление
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

    // Вставляем плашку сверху (если есть), а затем само сообщение с сохранением функции клика по нику
    msgElement.innerHTML = `${topBadgeHtml}<div>${badgesHtml}<span class="chat-username" style="color: ${color}" onclick="openUserHistory('${escapeHtml(username)}', '${color}')">${escapeHtml(username)}:</span> <span class="chat-text">${renderedMessage}</span></div>`;

    // ЗАПИСЫВАЕМ СООБЩЕНИЕ В ИСТОРИЮ (убираем плашку, чтобы в истории был только текст)
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
let hasDragged = false; // Флаг, который блокирует случайный клик

slider.addEventListener('mousedown', (e) => {
    isDown = true;
    hasDragged = false; // Сбрасываем флаг при новом нажатии
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
    // Флаг hasDragged сбросится сам при следующем mousedown
});

slider.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 1.5;

    // Если мы сдвинули мышку больше чем на 5 пикселей - это 100% скролл
    if (Math.abs(walk) > 5) {
        hasDragged = true;
    }

    slider.scrollLeft = scrollLeft - walk;
});

// ==========================================
// ЛОГИКА ОКНА ИСТОРИИ И ПЕРЕТАСКИВАНИЯ (DRAG)
// ==========================================
const userModal = document.getElementById('userHistoryModal');
const modalHeader = document.getElementById('modalHeader');
const modalBody = document.getElementById('modalBody');
const modalTitle = document.getElementById('modalTitle');

let isDraggingModal = false;
let dragOffsetX, dragOffsetY;

// Нажатие на заголовок окна
modalHeader.addEventListener('mousedown', (e) => {
    e.preventDefault()
    isDraggingModal = true;
    dragOffsetX = e.clientX - userModal.getBoundingClientRect().left;
    dragOffsetY = e.clientY - userModal.getBoundingClientRect().top;
});

// Движение мышкой по всему экрану
document.addEventListener('mousemove', (e) => {
    if (!isDraggingModal) return;

    // Высчитываем новые координаты, не даем окну уйти за верхний левый край экрана
    let newX = e.clientX - dragOffsetX;
    let newY = e.clientY - dragOffsetY;

    if (newX < 0) newX = 0;
    if (newY < 0) newY = 0;

    userModal.style.left = `${newX}px`;
    userModal.style.top = `${newY}px`;
});

// Отпускание кнопки мыши
document.addEventListener('mouseup', () => {
    isDraggingModal = false;
});

// Открытие окна по клику на ник
function openUserHistory(username, color) {
    const cleanUser = username.toLowerCase();
    const history = userHistory[cleanUser] || [];

    modalTitle.innerText = `History: ${username}`;
    modalTitle.style.color = color;

    if (history.length === 0) {
        modalBody.innerHTML = '<span style="color: gray;">No recent messages found.</span>';
    } else {
        // Рендерим историю, самые новые снизу
        modalBody.innerHTML = history.map(msg => `<div class="history-msg">${msg}</div>`).join('');
    }

    // Сбрасываем позицию по центру при открытии нового
    userModal.style.top = '20%';
    userModal.style.left = '40%';
    userModal.classList.remove('hidden');

    // Прокручиваем в самый низ к новым сообщениям
    modalBody.scrollTop = modalBody.scrollHeight;
}

function closeUserHistory() {
    userModal.classList.add('hidden');
}


const chatMessagesContainer = document.getElementById('chat-messages');
const scrollToBottomBtn = document.getElementById('scrollToBottomBtn');

// Слушаем скролл внутри чата
chatMessagesContainer.addEventListener('scroll', () => {
    // Высчитываем, находится ли пользователь в самом низу (с запасом в 120 пикселей)
    const isAtBottom = Math.ceil(chatMessagesContainer.scrollTop + chatMessagesContainer.clientHeight) >= (chatMessagesContainer.scrollHeight - 120);

    if (isAtBottom) {
        scrollToBottomBtn.classList.add('hidden'); // Прячем, если мы и так внизу
    } else {
        scrollToBottomBtn.classList.remove('hidden'); // Показываем, если улетели вверх
    }
});

// Функция мгновенного прыжка вниз
function scrollToBottom() {
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    scrollToBottomBtn.classList.add('hidden');
}
renderFavorites();
fetchGlobal7TV();
loadStream();
