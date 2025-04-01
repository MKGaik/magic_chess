import '../css/style.css';
import { Game, setSendWebSocketMessageCallback } from './game/Game';
import * as THREE from 'three';

// Глобальные переменные
let game = null;
let gameInitialized = false;
let currentNickname = null;
let ws = null; // Переменная для WebSocket соединения
let opponentNickname = null;
let playerColor = null; // 'white' или 'black'
let countdownInterval = null;

// Функция для показа экрана по ID
function showScreen(screenId) {
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.remove('hidden');
    screen.style.display = 'flex'; // Убедимся, что flex используется для центрирования
    screen.style.opacity = '1'; // Показываем плавно (можно добавить transition в CSS)
  }
}

// Функция для скрытия экрана по ID
function hideScreen(screenId) {
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.style.opacity = '0';
    setTimeout(() => { // Добавляем задержку перед скрытием
        screen.classList.add('hidden');
        screen.style.display = 'none';
    }, 300); // 300ms - время для fade-out анимации (можно настроить)
  }
}

// Функция для показа сообщения об окончании игры или другого важного сообщения
function showGameMessage(message) {
    const gameMessageText = document.getElementById('game-message-text');
    if(gameMessageText) {
        gameMessageText.textContent = message;
    }
    // Скрываем все остальные оверлеи на всякий случай
    hideScreen('nickname-entry');
    hideScreen('matchmaking-lobby');
    hideScreen('action-panel'); 
    // Показываем сообщение
    showScreen('game-message');
}

// Инициализация игры (вынесена отдельно)
async function initializeGame() {
  if (!gameInitialized) {
    game = new Game(); // Создаем игру только при необходимости
    
    // Показываем экран загрузки перед инициализацией
    showScreen('loading-screen'); 

    await game.init();
    gameInitialized = true;

    // Скрываем экран загрузки после инициализации
    hideScreen('loading-screen');

    // Настраиваем обработчики игровых кнопок
    setupGameControls(game);
    
    // Устанавливаем колбэк для отправки сообщений в Game после инициализации
    setSendWebSocketMessageCallback((messageData) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(messageData));
        }
    });
  }
}

// Функция для старта одиночной игры
async function startSinglePlayerGame() {
  await initializeGame(); 
  game.setPlayMode('singlePlayer');
  game.resetGame(); // Сбрасываем состояние перед новой игрой (белыми по умолчанию)
  hideScreen('game-mode-menu');
  showScreen('action-panel'); 
}

// Функция для старта сетевой игры (после матчмейкинга)
async function startMultiplayerGame() {
    await initializeGame();
    game.setPlayMode('multiplayer');
    game.resetGame(playerColor); // Передаем цвет игрока для расстановки и определения первого хода
    hideScreen('matchmaking-lobby');
    showScreen('action-panel');
    // TODO: Обновить UI для отображения информации о сопернике и цвете
    console.log(`Начало сетевой игры. Вы играете за ${playerColor}. Соперник: ${opponentNickname}`);
}

// Функция для возврата в главное меню
function returnToMainMenu() {
    disconnectWebSocket(); // Закрываем соединение при возврате в меню
    hideScreen('nickname-entry');
    hideScreen('matchmaking-lobby');
    hideScreen('game-message');
    hideScreen('action-panel');
    showScreen('game-mode-menu');
    // Скрываем таймер на всякий случай
    const countdownTimer = document.getElementById('countdown-timer');
    if (countdownTimer) countdownTimer.classList.add('hidden');
}

// Ждем полной загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  // Получаем ссылки на элементы UI
  const singlePlayerBtn = document.getElementById('single-player-btn');
  const multiplayerBtn = document.getElementById('multiplayer-btn');
  const gameModeMenu = document.getElementById('game-mode-menu');
  const nicknameEntry = document.getElementById('nickname-entry');
  const nicknameInput = document.getElementById('nickname-input');
  const submitNicknameBtn = document.getElementById('submit-nickname-btn');
  const matchmakingLobby = document.getElementById('matchmaking-lobby');
  const lobbyStatus = document.getElementById('lobby-status');
  const cancelMatchmakingBtn = document.getElementById('cancel-matchmaking-btn');
  const backToMenuFromNicknameBtn = document.getElementById('back-to-menu-from-nickname-btn');
  const gameMessagePanel = document.getElementById('game-message');
  const backToMenuBtn = document.getElementById('back-to-menu-btn');

  // Показываем главное меню при старте
  showScreen('game-mode-menu');

  // Обработчик кнопки "Одиночная игра"
  if (singlePlayerBtn) {
    singlePlayerBtn.addEventListener('click', startSinglePlayerGame);
  }
  
  // Обработчик кнопки "Сетевая игра"
  if (multiplayerBtn) {
    multiplayerBtn.addEventListener('click', () => {
      hideScreen('game-mode-menu');
      showScreen('nickname-entry');
    });
  }

  // Обработчик кнопки "Назад в меню" из экрана ввода ника
  if (backToMenuFromNicknameBtn) {
      backToMenuFromNicknameBtn.addEventListener('click', returnToMainMenu);
  }

  // Обработчик кнопки "Найти игру" (ввод ника)
  if (submitNicknameBtn && nicknameInput) {
      submitNicknameBtn.addEventListener('click', () => {
          const nickname = nicknameInput.value.trim();
          if (nickname) {
              currentNickname = nickname;
              hideScreen('nickname-entry');
              showScreen('matchmaking-lobby');
              if (lobbyStatus) lobbyStatus.textContent = `Подключение к серверу...`;
              // Подключаемся к WebSocket
              connectWebSocket(currentNickname);
          } else {
              // TODO: Показать ошибку, если ник пустой
              alert('Пожалуйста, введите никнейм.');
          }
      });
  }

  // Обработчик кнопки "Отменить поиск"
  if (cancelMatchmakingBtn) {
      cancelMatchmakingBtn.addEventListener('click', () => {
          returnToMainMenu();
          // TODO: Отправить сообщение об отмене на сервер, если нужно?
          // Сервер и так обработает disconnect
      });
  }

  // Обработчик кнопки "Вернуться в меню" после игры/сообщения
  if (backToMenuBtn) {
      backToMenuBtn.addEventListener('click', returnToMainMenu);
  }

  // Пример вызова сообщения (для теста)
  // setTimeout(() => showGameMessage('Соперник отключился. Вы победили!'), 5000);
});

// Настройка игровых элементов управления
function setupGameControls(gameInstance) {
  // Убедимся, что gameInstance передан и существует
  if (!gameInstance) return;

  // Добавляем обработчики событий для кнопок
  const moveBtn = document.getElementById('move-btn');
  if (moveBtn) {
    moveBtn.addEventListener('click', () => {
      gameInstance.startMoveMode();
    });
  }
  
  const skillBtn = document.getElementById('skill-btn');
  const skillPanel = document.getElementById('skill-panel');
  const actionButtons = document.getElementById('action-buttons');
  
  if (skillBtn && skillPanel && actionButtons) {
    skillBtn.addEventListener('click', () => {
      skillPanel.style.display = 'block';
      actionButtons.style.display = 'none';
      // Показываем кнопку отмены
      const cancelSkillBtn = document.getElementById('cancel-skill-btn');
      if(cancelSkillBtn) cancelSkillBtn.style.display = 'inline-block';
    });
  }
  
  const skill1Btn = document.getElementById('skill-1-btn');
  if (skill1Btn) {
    skill1Btn.addEventListener('click', (e) => {
      // Проверяем, не был ли клик по кнопке информации
      if (!e.target.classList.contains('skill-info')) {
        gameInstance.useSkill(0);
      }
    });
  }
  
  const skill2Btn = document.getElementById('skill-2-btn');
  if (skill2Btn) {
    skill2Btn.addEventListener('click', (e) => {
      // Проверяем, не был ли клик по кнопке информации
      if (!e.target.classList.contains('skill-info')) {
        gameInstance.useSkill(1);
      }
    });
  }
  
  const cancelSkillBtn = document.getElementById('cancel-skill-btn');
  if (cancelSkillBtn && skillPanel && actionButtons) {
    cancelSkillBtn.addEventListener('click', () => {
      skillPanel.style.display = 'none';
      actionButtons.style.display = 'flex'; // Возвращаем кнопки действий
      gameInstance.cancelAction(); // Сообщаем игре об отмене действия
    });
  }
}

// --- Сетевое взаимодействие --- 

// Функция подключения к WebSocket
function connectWebSocket(nickname) {
    // Новый адрес для WebSocket
    ws = new WebSocket(`wss://${window.location.host}/ws`);

    ws.onopen = () => {
        console.log('WebSocket соединение открыто.');
        // Отправляем никнейм на сервер
        ws.send(JSON.stringify({ type: 'setNickname', nickname: nickname }));
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('Сообщение от сервера:', data);
            handleServerMessage(data);
        } catch (error) {
            console.error('Ошибка обработки сообщения от сервера:', error);
        }
    };

    ws.onerror = (error) => {
        console.error('Ошибка WebSocket:', error);
        showGameMessage('Ошибка подключения к серверу. Попробуйте позже.');
        // Возможно, стоит вернуть пользователя в главное меню
        returnToMainMenu(); 
    };

    ws.onclose = () => {
        console.log('WebSocket соединение закрыто.');
        ws = null; // Сбрасываем соединение
        // Если игра не началась, и мы не в главном меню, возможно, показать сообщение
        const lobbyScreen = document.getElementById('matchmaking-lobby');
        const gameMessageScreen = document.getElementById('game-message');
        if (!lobbyScreen.classList.contains('hidden') || 
            (gameMessageScreen.classList.contains('hidden') && !document.getElementById('game-mode-menu').classList.contains('hidden'))) {
           // Если мы были в лобби или играли, и соединение закрылось не по нашей воле
           // (т.е. не через кнопку "Отмена" или "Вернуться в меню")
           // showGameMessage('Соединение с сервером потеряно.');
           // returnToMainMenu(); // Решаем, нужно ли автоматом возвращать в меню
        }
    };
}

// Функция отключения от WebSocket
function disconnectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    ws = null;
    // Сбрасываем связанные с игрой переменные
    opponentNickname = null;
    playerColor = null;
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

// Обработка сообщений от сервера
function handleServerMessage(data) {
    const lobbyStatus = document.getElementById('lobby-status');
    const countdownTimer = document.getElementById('countdown-timer');

    switch (data.type) {
        case 'waitingForOpponent':
            if (lobbyStatus) lobbyStatus.textContent = 'Ожидание соперника...';
            break;
        case 'matchFound':
            opponentNickname = data.opponentNickname;
            playerColor = data.color;
            if (lobbyStatus) lobbyStatus.textContent = `Соперник найден: ${opponentNickname}!`;
            if (countdownTimer) {
                countdownTimer.classList.remove('hidden');
                let count = 5;
                countdownTimer.textContent = count;
                countdownInterval = setInterval(() => {
                    count--;
                    if (count > 0) {
                        countdownTimer.textContent = count;
                    } else {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                        startMultiplayerGame(); // Начинаем игру!
                    }
                }, 1000);
            }
            break;
        case 'opponentDisconnected':
            showGameMessage(data.message || 'Соперник отключился. Вы победили!');
            disconnectWebSocket(); // Закрываем соединение после сообщения
            // Сбрасываем состояние игры, если она была инициализирована
            // Убираем resetGame и отсюда, чтобы не сбрасывать доску после победы по дисконнекту
            // if(game) { 
            //  game.resetGame(); 
            // } 
            break;
        case 'gameState': // Пример: получение полного состояния игры
            // TODO: game.loadState(data.state);
            break;
        case 'opponentMove': // Добавляем обработку хода соперника
            if (game && gameInitialized) {
                game.applyOpponentMove(data.action); // Передаем содержимое поля 'action'
            } else {
                console.warn('Получен ход соперника, но игра не инициализирована');
            }
            break;
        case 'error':
            console.error('Ошибка от сервера:', data.message);
            showGameMessage(`Ошибка: ${data.message}`);
            disconnectWebSocket();
            returnToMainMenu();
            break;
        default:
            console.log('Получено неизвестное сообщение от сервера:', data.type);
    }
} 