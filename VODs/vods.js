// Получаем ник канала из URL (например: vods.html?channel=shroud)
const urlParams = new URLSearchParams(window.location.search);
const channelName = urlParams.get('channel');

// Форматируем секунды в удобное время (ЧЧ:ММ:СС)
function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const hDisplay = hours > 0 ? hours + ":" : "";
    const mDisplay = (minutes < 10 && hours > 0 ? "0" : "") + minutes + ":";
    const sDisplay = seconds < 10 ? "0" + seconds : seconds;

    return hDisplay + mDisplay + sDisplay;
}

async function loadVods() {
    if (!channelName) {
        document.getElementById('vodGrid').innerHTML = '<div style="color: red; padding: 20px;">Ошибка: Канал не указан в URL!</div>';
        return;
    }

    document.getElementById('vodChannelName').innerText = channelName;
    const grid = document.getElementById('vodGrid');

    try {
        // Делаем запрос к НАШЕМУ локальному Python серверу
        const response = await fetch(`/api/vods?channel=${channelName}`);

        if (!response.ok) {
            throw new Error("Не удалось получить данные с сервера");
        }

        const data = await response.json();
        const edges = data.data.user.videos.edges;

        if (edges.length === 0) {
            grid.innerHTML = '<div style="color: gray; padding: 20px; font-size: 18px;">У этого канала нет сохраненных записей (VODs).</div>';
            return;
        }

        // Рисуем карточки
        grid.innerHTML = edges.map(edge => {
            const video = edge.node;
            const duration = formatTime(video.lengthSeconds);
            const dateStr = new Date(video.createdAt).toLocaleDateString();

            // Если у видео нет превью, ставим заглушку
            const thumbUrl = video.previewThumbnailURL ? video.previewThumbnailURL : 'https://vod-secure.twitch.tv/assets/default_vod_thumb-320x180.jpg';

            return `
                <div class="vod-card" onclick="openVodPlayer('${video.id}')">
                    <div class="vod-thumb-wrapper">
                        <img class="vod-thumb" src="${thumbUrl}" alt="Thumbnail">
                        <span class="vod-duration">${duration}</span>
                    </div>
                    <div class="vod-info">
                        <div class="vod-title" title="${video.title}">${video.title}</div>
                        <div class="vod-date">📅 ${dateStr}</div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error(e);
        grid.innerHTML = `<div style="color: #ff4a4a; padding: 20px;">Ошибка загрузки записей. Проверьте запущен ли Python сервер.</div>`;
    }
}

// Заглушка для следующего этапа: Открытие самого плеера
function openVodPlayer(videoId) {
    // Перекидываем на страницу плеера, сохраняя ник канала в ссылке
    window.location.href = `vod_player.html?video=${videoId}&channel=${channelName}`;
}

// Запускаем загрузку
loadVods();