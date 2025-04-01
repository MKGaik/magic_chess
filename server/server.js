const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 6080 });

// Хранилище для подключенных клиентов и ожидающих игроков
const clients = new Map(); // Map для хранения { ws -> { nickname: string, status: 'waiting' | 'playing' } }
let waitingPlayer = null; // Храним ws ожидающего игрока

console.log('WebSocket сервер запущен на порту 6080');

wss.on('connection', (ws) => {
    console.log('Новый клиент подключен');
    clients.set(ws, { nickname: null, status: 'connected' }); // Сначала статус 'connected'

    // Обработка сообщений от клиента
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Получено сообщение:', data);

            // Обработка разных типов сообщений
            switch (data.type) {
                case 'setNickname':
                    handleSetNickname(ws, data.nickname);
                    break;
                // --- НОВЫЕ ТИПЫ СООБЩЕНИЙ ДЛЯ ХОДОВ --- 
                case 'move':
                case 'attack':
                case 'skill':
                    handlePlayerAction(ws, data);
                    break;
                // Добавим другие типы сообщений позже (например, 'cancelMatchmaking')
                default:
                    console.log('Получен неизвестный тип сообщения:', data.type);
            }
        } catch (error) {
            console.error('Ошибка обработки сообщения:', error);
            // Можно отправить сообщение об ошибке клиенту
            // ws.send(JSON.stringify({ type: 'error', message: 'Неверный формат сообщения' }));
        }
    });

    // Обработка закрытия соединения
    ws.on('close', () => {
        const clientData = clients.get(ws);
        console.log(`Клиент отключен: ${clientData ? clientData.nickname : 'еще не представился'}`);
        handleDisconnect(ws);
        clients.delete(ws);
    });

    // Обработка ошибок соединения
    ws.on('error', (error) => {
        console.error('Ошибка WebSocket соединения:', error);
        // Закрываем соединение при ошибке
        handleDisconnect(ws); 
        clients.delete(ws);
    });
});

// Функция обработки установки никнейма и начала поиска
function handleSetNickname(ws, nickname) {
    if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0 || nickname.length > 16) {
        ws.send(JSON.stringify({ type: 'error', message: 'Неверный никнейм' }));
        return;
    }

    const cleanNickname = nickname.trim();
    const clientData = clients.get(ws);
    if (clientData) {
        clientData.nickname = cleanNickname;
        clientData.status = 'waiting';
        console.log(`Клиент установил никнейм: ${cleanNickname}`);

        // Попытка начать матчмейкинг
        tryMatchmaking(ws);
    } else {
         ws.send(JSON.stringify({ type: 'error', message: 'Клиент не найден' }));
    }
}

// Функция поиска пары для игры
function tryMatchmaking(newPlayerWs) {
    const newPlayerData = clients.get(newPlayerWs);
    if (!newPlayerData || newPlayerData.status !== 'waiting') {
        return; // Игрок уже в игре или отключился
    }

    if (waitingPlayer && waitingPlayer !== newPlayerWs) {
        const waitingPlayerData = clients.get(waitingPlayer);
        // Убедимся, что ожидающий игрок все еще ждет
        if (waitingPlayerData && waitingPlayerData.status === 'waiting') {
            console.log(`Найден соперник! ${waitingPlayerData.nickname} vs ${newPlayerData.nickname}`);
            
            const player1 = waitingPlayer;
            const player2 = newPlayerWs;
            const player1Data = waitingPlayerData;
            const player2Data = newPlayerData;

            // Сбрасываем ожидающего игрока
            waitingPlayer = null; 

            // Обновляем статусы игроков
            player1Data.status = 'playing';
            player2Data.status = 'playing';
            player1Data.opponent = player2;
            player2Data.opponent = player1;

            // Отправляем сообщения о начале игры обоим игрокам
            // Определяем, кто играет белыми, кто черными (случайно)
            const firstPlayerIsWhite = Math.random() < 0.5;
            const whitePlayer = firstPlayerIsWhite ? player1 : player2;
            const blackPlayer = firstPlayerIsWhite ? player2 : player1;
            const whitePlayerData = clients.get(whitePlayer);
            const blackPlayerData = clients.get(blackPlayer);

            // Сообщение для белого игрока
            whitePlayer.send(JSON.stringify({
                type: 'matchFound',
                opponentNickname: blackPlayerData.nickname,
                color: 'white' 
            }));
            
            // Сообщение для черного игрока
            blackPlayer.send(JSON.stringify({
                type: 'matchFound',
                opponentNickname: whitePlayerData.nickname,
                color: 'black'
            }));

        } else {
             // Ожидающий игрок уже не ждет (отключился или нашел другую игру?), ставим нового
            waitingPlayer = newPlayerWs;
            console.log(`${newPlayerData.nickname} ожидает соперника...`);
            newPlayerWs.send(JSON.stringify({ type: 'waitingForOpponent' }));
        }
    } else {
        // Нет ожидающего игрока, становимся ожидающим
        waitingPlayer = newPlayerWs;
        console.log(`${newPlayerData.nickname} ожидает соперника...`);
        newPlayerWs.send(JSON.stringify({ type: 'waitingForOpponent' }));
    }
}

// Функция обработки отключения игрока
function handleDisconnect(disconnectedWs) {
    const disconnectedPlayerData = clients.get(disconnectedWs);

    // Если игрок ждал в лобби
    if (waitingPlayer === disconnectedWs) {
        waitingPlayer = null;
        console.log('Ожидающий игрок отключился.');
    }
    // Если игрок был в игре
    else if (disconnectedPlayerData && disconnectedPlayerData.status === 'playing' && disconnectedPlayerData.opponent) {
        const opponentWs = disconnectedPlayerData.opponent;
        const opponentData = clients.get(opponentWs);

        console.log(`Игрок ${disconnectedPlayerData.nickname} отключился во время игры.`);

        if (opponentWs && opponentWs.readyState === WebSocket.OPEN && opponentData) {
            // Сообщаем оставшемуся игроку о победе
            opponentWs.send(JSON.stringify({
                type: 'opponentDisconnected',
                message: 'Соперник отключился. Вы победили!'
            }));
            // Возвращаем оставшегося игрока в состояние 'connected', чтобы он мог снова искать игру
             opponentData.status = 'connected'; 
             opponentData.opponent = null;
        }
        // Очищаем данные отключившегося
        disconnectedPlayerData.opponent = null;
    }
    // В любом случае удаляем клиента из общего списка
    clients.delete(disconnectedWs);
}

// --- НОВАЯ ФУНКЦИЯ ДЛЯ ПЕРЕСЫЛКИ ХОДОВ --- 
function handlePlayerAction(senderWs, actionData) {
    const senderData = clients.get(senderWs);

    // Проверяем, что отправитель существует, находится в игре и у него есть оппонент
    if (!senderData || senderData.status !== 'playing' || !senderData.opponent) {
        console.warn(`Игрок ${senderData?.nickname || '??'} отправил действие, не будучи в игре, или нет оппонента.`);
        return;
    }

    const opponentWs = senderData.opponent;
    const opponentData = clients.get(opponentWs);

    // Проверяем, что оппонент все еще подключен и находится в игре
    if (opponentWs && opponentWs.readyState === WebSocket.OPEN && opponentData && opponentData.status === 'playing') {
        // Формируем сообщение для оппонента
        const messageForOpponent = {
            type: 'opponentMove', // Указываем тип сообщения для клиента
            action: actionData // Помещаем все данные хода внутрь поля 'action'
        };

        console.log(`Пересылка действия от ${senderData.nickname} к ${opponentData.nickname}:`, messageForOpponent);
        opponentWs.send(JSON.stringify(messageForOpponent));
    } else {
        console.warn(`Не удалось переслать действие игроку ${opponentData?.nickname || '??'} (не найден, отключен или не в игре).`);
        // Возможно, стоит уведомить отправителя об ошибке?
    }
}
// ----------------------------------------

// Обработка ошибок самого сервера (редко, но бывает)
wss.on('error', (error) => {
    console.error('Ошибка WebSocket сервера:', error);
}); 