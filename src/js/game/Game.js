import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Board } from './Board';
import { UnitFactory } from './UnitFactory';
import { UnitManager } from './UnitManager';
import { UIManager } from './UIManager';
import { SkillAnimator } from './SkillAnimator';

// --- Глобальные переменные для доступа к WebSocket из Game --- 
let sendWebSocketMessage = null;
// Функция для установки колбэка отправки сообщения
export function setSendWebSocketMessageCallback(callback) {
  sendWebSocketMessage = callback;
}
// ---

export class Game {
  constructor() {
    // Настройка игры
    this.gameContainer = document.getElementById('game-container');
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.clock = new THREE.Clock(); // Добавляем часы для deltaTime
    
    // Цвет игрока в сетевой игре ('white' или 'black')
    this.myColor = 'white'; 
    
    // Менеджеры игры
    this.board = null;
    this.unitFactory = null;
    this.unitManager = null;
    this.uiManager = null;
    this.skillAnimator = null;
    
    // Состояние игры
    this.currentTurnColor = 'white'; // Чей ход ('white' или 'black')
    this.selectedUnit = null;
    this.gameMode = 'select'; // select, move, skill
    this.currentSkillIndex = -1;
    
    // Данные о последнем ходе для отправки
    this.lastMoveData = null;
    
    // Массив для колбэков анимации
    this.animationCallbacks = [];
    
    // Режим игры
    this.playMode = 'multiplayer'; // 'singlePlayer' или 'multiplayer'
    
    // Привязка обработчиков событий
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseClick = this.onMouseClick.bind(this);
    this.animate = this.animate.bind(this);
    
    // Сохраняем ссылки на привязанные функции для корректного удаления
    this.boundOnMouseMove = this.onMouseMove;
    this.boundOnMouseClick = this.onMouseClick;
  }
  
  // Установка режима игры
  setPlayMode(mode) {
    this.playMode = mode;
    console.log(`Режим игры установлен: ${mode}`);
  }
  
  async init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB); // Более спокойный голубой цвет для неба

    // Создаем камеру
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    
    // Позиционируем камеру для лучшего центрирования доски
    this.camera.position.set(0, 120, 120);
    this.camera.lookAt(0, 0, 0);
    
    // Передаем ссылку на камеру в сцену, чтобы доска могла её использовать
    this.scene.camera = this.camera;

    // Создаем рендерер с улучшенными настройками
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      logarithmicDepthBuffer: true,
      precision: 'highp'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    
    // ВКЛЮЧАЕМ ТЕНИ (было false)
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Мягкие тени
    
    this.gameContainer.appendChild(this.renderer.domElement);

    // Упрощенная модель освещения: более сильный ambient и меньше directional
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Увеличиваем интенсивность
    this.scene.add(ambientLight);

    // Один направленный свет без теней
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7); // Уменьшаем интенсивность
    directionalLight.position.set(0, 200, 100);
    
    // ВКЛЮЧАЕМ ТЕНИ для directionalLight (было false)
    directionalLight.castShadow = true;
    
    // Настройка параметров тени для лучшего качества и производительности
    directionalLight.shadow.mapSize.width = 2048; // Увеличиваем разрешение карты теней
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 50; // Ближняя граница тени
    directionalLight.shadow.camera.far = 500; // Дальняя граница тени
    directionalLight.shadow.camera.left = -150; // Границы области тени
    directionalLight.shadow.camera.right = 150;
    directionalLight.shadow.camera.top = 150;
    directionalLight.shadow.camera.bottom = -150;
    directionalLight.shadow.bias = -0.001; // Поправка для предотвращения артефактов
    
    this.scene.add(directionalLight);
    
    // Добавляем помощник для камеры тени (можно закомментировать для продакшена)
    // const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    // this.scene.add(shadowHelper);

    // Добавляем дополнительный мягкий свет для заполнения сцены
    const fillLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.5);
    this.scene.add(fillLight);

    // Создаем контролы для камеры
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 400;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.target.set(0, 0, 0); // Устанавливаем цель на центр сцены
    this.controls.update();

    // Инициализируем менеджеры
    this.board = new Board(this.scene);
    this.unitFactory = new UnitFactory();
    this.uiManager = new UIManager(); // Создаем UIManager без unitManager
    // Создаем UnitManager, передаем ему uiManager и camera
    this.unitManager = new UnitManager(this.scene, this.board, this.unitFactory, this.uiManager, this.camera);
    // Устанавливаем ссылку на unitManager в uiManager ПОСЛЕ создания unitManager
    this.uiManager.unitManager = this.unitManager; 
    
    // Передаем ссылку на игру в unitManager для доступа к информации о текущем ходе
    this.unitManager.game = this;
    
    // Флаги состояния игры
    this.gameMode = 'select'; // 'select', 'move', 'skill'
    this.selectedUnit = null;
    this.targetUnit = null;
    this.selectedSkill = null;
    
    // Настраиваем контроль мыши
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    window.addEventListener('mousemove', this.boundOnMouseMove, false);
    window.addEventListener('click', this.boundOnMouseClick, false);
    window.addEventListener('resize', () => this.onWindowResize(), false);
    
    // Запускаем инициализацию компонентов и дожидаемся завершения
    await this.setupGame();
    
    // Запускаем рендеринг
    this.animate();
    
    return true; // Возвращаем true, чтобы знать, что инициализация завершена
  }
  
  async setupGame() {
    try {
      // Последовательно инициализируем компоненты, чтобы дождаться загрузки моделей
      await this.board.init();
      console.log("Доска инициализирована");
      
      await this.unitFactory.init();
      console.log("Фабрика юнитов инициализирована");
      
      await this.unitManager.init();
      console.log("Менеджер юнитов инициализирован");
      
      this.uiManager.init();
      console.log("UI инициализирован");
      
      // Создаем SkillAnimator после инициализации основных компонентов
      this.skillAnimator = new SkillAnimator(this); // Передаем Game как sceneManager
      console.log("Аниматор скиллов инициализирован");
      
      // Выполняем начальную расстановку фигур
      this.setupInitialPieces(this.myColor);
      console.log("Фигуры расставлены");
      
      return true;
    } catch (error) {
      console.error("Ошибка при инициализации игры:", error);
      throw error;
    }
  }
  
  animate() {
    requestAnimationFrame(this.animate);
    
    // Получаем время с прошлого кадра
    const deltaTime = this.clock.getDelta();
    
    // Обновляем контролы, если они инициализированы
    if (this.controls) {
      this.controls.update();
    }
    
    // Обновляем UI (включая значения ХП/МП) только если UIManager инициализирован
    if (this.uiManager && this.uiManager.selectedUnitInfo) {
      this.uiManager.updateUI();
    }
    
    // Обновляем ориентацию индикаторов статуса и АНИМАЦИИ для всех юнитов
    if (this.unitManager && this.unitManager.units) {
      this.unitManager.units.forEach(unit => {
        if (unit && typeof unit.updateIndicatorsOrientation === 'function') {
          unit.updateIndicatorsOrientation(this.camera);
        }
        // Добавляем обновление анимаций
        if (unit && typeof unit.updateAnimations === 'function') {
           unit.updateAnimations(deltaTime);
        }
      });
    }
    
    // Выполняем все активные анимационные колбэки
    // Копируем массив перед итерацией, чтобы избежать проблем при удалении колбэка внутри него самого
    const callbacksToExecute = [...this.animationCallbacks];
    callbacksToExecute.forEach(callback => {
        // Передаем deltaTime в колбэк
        // Предполагаем, что колбэк имеет сигнатуру (time, deltaTime)
        // В нашем случае SkillAnimator использует только deltaTime
        callback(this.clock.elapsedTime, deltaTime); 
    });
    
    this.renderer.render(this.scene, this.camera);
  }
  
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  onMouseMove(event) {
    // Не обрабатываем движения мыши, если игра закончена
    if (this.gameMode === 'gameOver') return;
    
    // Преобразование координат мыши в нормализованные координаты устройства
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Обновление луча для выбора объектов
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Подсветка ячеек, на которые можно переместить выбранную фигуру
    if (this.gameMode === 'move' && this.selectedUnit) {
      const intersects = this.raycaster.intersectObjects(this.board.getCellObjects(), true);
      this.board.resetHighlights();
      
      // Сначала всегда подсвечиваем клетку под выбранной фигурой
      const selectedUnitPosition = this.selectedUnit.position;
      this.board.highlightCell(selectedUnitPosition.x, selectedUnitPosition.z, 'select');
      
      // Показываем все доступные ходы
      const validMoves = this.unitManager.getValidMoves(this.selectedUnit);
      validMoves.forEach(position => {
        // Определяем, атака это или ход
        const targetUnit = this.unitManager.getUnitAtPosition(position);
        const highlightKey = targetUnit ? 'attack' : 'move'; // Красный для атаки, желтый для хода
        this.board.highlightCell(position.x, position.z, highlightKey);
      });
      
      if (intersects.length > 0) {
        const cellObject = intersects[0].object;
        const cellPosition = this.board.getCellPositionFromObject(cellObject);
        
        // Подсвечиваем ячейку, на которую указывает мышь
        if (cellPosition) {
          // Не перезаписываем подсветку клетки, где стоит выбранная фигура
          if (!(cellPosition.x === selectedUnitPosition.x && cellPosition.z === selectedUnitPosition.z)) {
            if (validMoves.some(pos => pos.x === cellPosition.x && pos.z === cellPosition.z)) {
              const targetUnit = this.unitManager.getUnitAtPosition(cellPosition);
              const highlightKey = targetUnit ? 'attack' : 'move';
              this.board.highlightCell(cellPosition.x, cellPosition.z, highlightKey);
            } else {
              this.board.highlightCell(cellPosition.x, cellPosition.z, 'attack');
            }
          }
        }
      }
    } else if (this.gameMode === 'skill' && this.selectedUnit && this.currentSkillIndex !== -1) {
      const intersects = this.raycaster.intersectObjects(this.board.getCellObjects(), true);
      this.board.resetHighlights();
      
      // Сначала всегда подсвечиваем клетку под выбранной фигурой
      const selectedUnitPosition = this.selectedUnit.position;
      this.board.highlightCell(selectedUnitPosition.x, selectedUnitPosition.z, 'select');
      
      // Показываем все доступные цели для умения
      const validTargets = this.unitManager.getValidSkillTargets(
        this.selectedUnit, 
        this.selectedUnit.skills[this.currentSkillIndex]
      );
      
      validTargets.forEach(position => {
        // Используем ключ 'skill' для подсветки
        this.board.highlightCell(position.x, position.z, 'skill'); 
      });
      
      if (intersects.length > 0) {
        const cellObject = intersects[0].object;
        const cellPosition = this.board.getCellPositionFromObject(cellObject);
        
        if (cellPosition) {
          // Не перезаписываем подсветку клетки, где стоит выбранная фигура
          if (!(cellPosition.x === selectedUnitPosition.x && cellPosition.z === selectedUnitPosition.z)) {
            if (validTargets.some(pos => pos.x === cellPosition.x && pos.z === cellPosition.z)) {
              this.board.highlightCell(cellPosition.x, cellPosition.z, 'skill');
            } else {
              this.board.highlightCell(cellPosition.x, cellPosition.z, 'attack');
            }
          }
        }
      }
    }
  }
  
  onMouseClick(event) {
    // Не обрабатываем клики, если игра закончена
    if (this.gameMode === 'gameOver') return;
    
    // Проверяем, ход ли текущего игрока
    const isMyTurn = this.currentTurnColor === this.myColor;
    if (this.playMode === 'multiplayer' && !isMyTurn) {
        console.log("Сейчас не ваш ход!");
        return; // Выходим, если не наш ход в сетевой игре
    }
    
    // Преобразование координат мыши в нормализованные координаты устройства
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Обновление луча для выбора объектов
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    console.log("onMouseClick: текущий режим =", this.gameMode);
    
    if (this.gameMode === 'select') {
      // Попытка выбора фигуры
      const intersects = this.raycaster.intersectObjects(this.unitManager.getUnitObjects(), true);
      
      if (intersects.length > 0) {
        const unitObject = intersects[0].object.parent || intersects[0].object;
        const unit = this.unitManager.getUnitByObject(unitObject);
        
        if (unit) {
          console.log("Клик по фигуре:", unit.type, "Цвет фигуры:", unit.ownerColor, "Мой цвет:", this.myColor, "Ход:", this.currentTurnColor);
          
          // --- ИЗМЕНЕНА ЛОГИКА ВЫБОРА ЮНИТА --- 
          let canSelect = false;
          if (this.playMode === 'singlePlayer') {
              // В одиночной игре выбираем фигуру, если ее цвет совпадает с текущим ходом
              if (unit.ownerColor === this.currentTurnColor) {
                  canSelect = true;
              }
          } else if (this.playMode === 'multiplayer') {
              // В мультиплеере выбираем фигуру, если она НАША И сейчас НАШ ход
              if (unit.ownerColor === this.myColor && this.currentTurnColor === this.myColor) {
                  canSelect = true;
              }
          }
          
          if (canSelect) {
          // --- КОНЕЦ ИЗМЕНЕНИЯ ЛОГИКИ ВЫБОРА ---
            
            // Проверка, не оглушена ли выбранная фигура
            if (typeof unit.isStunned === 'function' && unit.isStunned()) {
              console.warn(`Фигура ${unit.type} оглушена и не может ходить в этот ход!`);
              
              // Показываем информацию об оглушении
              if (this.uiManager && typeof this.uiManager.showMessage === 'function') {
                this.uiManager.showMessage("Фигура оглушена и не может ходить!");
              }
              
              return;
            }
            
            this.selectUnit(unit);
          } else {
            // Кликнули по фигуре противника
            if (this.selectedUnit) { // Если своя фигура уже выбрана - АТАКА
                console.log("Клик по врагу - Атака!");
                const isValidAttack = this.isValidAttackTarget(this.selectedUnit, unit);
                if (isValidAttack) {
                    this.handleAttack(this.selectedUnit, unit);
                } else {
                    console.log("Недопустимая цель для атаки");
                    this.selectUnit(null); // Сбрасываем выбор, если атака невозможна
                }
            } else {
                console.log("Нельзя выбрать фигуру противника.");
            }
          }
        }
      }
    } else if (this.gameMode === 'move' && this.selectedUnit) {
      console.log("Клик в режиме хода для фигуры:", this.selectedUnit.type);
      // Перемещение фигуры
      
      // Сначала проверяем, не оглушена ли фигура
      if (typeof this.selectedUnit.isStunned === 'function' && this.selectedUnit.isStunned()) {
        console.warn(`Фигура ${this.selectedUnit.type} оглушена и не может двигаться в этот ход!`);
        
        // Показываем информацию об оглушении
        if (this.uiManager && typeof this.uiManager.showMessage === 'function') {
          this.uiManager.showMessage("Фигура оглушена и не может ходить!");
        }
        
        // Отменяем выбор фигуры и возвращаемся в режим выбора, НЕ завершая ход
        this.selectedUnit.deselect();
        this.selectUnit(null);
        
        return;
      }
      
      // Получаем объекты клеток для проверки пересечений
      const cellObjects = this.board.getCellObjects();
      console.log("Количество объектов клеток для Raycaster:", cellObjects.length);
      
      const intersects = this.raycaster.intersectObjects(cellObjects, true);
      console.log("Пересечения:", intersects.length);
      
      if (intersects.length > 0) {
        const cellObject = intersects[0].object;
        const cellPosition = this.board.getCellPositionFromObject(cellObject);
        
        if (cellPosition) {
          console.log("Клик по клетке:", cellPosition);
          const validMoves = this.unitManager.getValidMoves(this.selectedUnit);
          console.log("Доступные ходы:", JSON.stringify(validMoves));
          
          // Проверка, содержит ли validMoves выбранную клетку
          const isValidTargetCell = validMoves.some(move => move.x === cellPosition.x && move.z === cellPosition.z);
          console.log("Является ли выбранная клетка допустимым ходом/целью атаки:", isValidTargetCell);
          
          if (isValidTargetCell) {
            // Проверяем, есть ли юнит на целевой клетке
            const targetUnit = this.unitManager.getUnitAtPosition(cellPosition);
            
            // --- ИЗМЕНЕНА ЛОГИКА ПРОВЕРКИ АТАКИ --- 
            // Атакуем, если на клетке есть юнит и его цвет ОТЛИЧАЕТСЯ от цвета ВЫБРАННОГО юнита
            if (targetUnit && targetUnit.ownerColor !== this.selectedUnit.ownerColor) { 
            // --- КОНЕЦ ИЗМЕНЕНИЯ ---
              // Если на клетке враг - АТАКУЕМ
              console.log("Цель - враг. Выполняю атаку на:", cellPosition);
              this.handleAttack(this.selectedUnit, targetUnit);
            } else if (!targetUnit) {
              // Если клетка пуста - ДВИГАЕМСЯ
              console.log("Цель - пустая клетка. Выполняю ход на позицию:", cellPosition);
              this.handleMove(this.selectedUnit, cellPosition.x, cellPosition.z);
            } else {
              // Клик на союзника или на себя - ничего не делаем (или можно снять выделение?)
              console.log("Нельзя ходить/атаковать на эту клетку (союзник или своя клетка).");
              // Можно добавить сброс выделения, если нужно
              // this.selectUnit(null); 
            }
          } else {
            console.log("Недопустимый ход/атака на позицию:", cellPosition);
            // Кликнули мимо валидных клеток, сбрасываем режим хода
            this.selectUnit(null); // Снимаем выделение
          }
        } else {
           console.log("Клик не определил позицию на доске.");
           this.selectUnit(null); // Снимаем выделение
        }
      } else {
        console.log("Клик не попал ни на одну клетку");
        // Клик мимо доски, сбрасываем режим хода
        this.selectUnit(null); // Снимаем выделение
      }
      
      // После хода или атаки (или отмены), режим должен сброситься 
      // (это делается внутри handleMove/handleAttack или при вызове selectUnit(null))
      // this.gameMode = 'select'; // Убрал явный сброс здесь, он происходит в handle/select
      // this.board.resetHighlights(); // Сброс подсветки тоже там же
    } else if (this.gameMode === 'skill' && this.selectedUnit && this.currentSkillIndex !== -1) {
      // Применение навыка
      const intersects = this.raycaster.intersectObjects(this.board.getCellObjects(), true);
      
      if (intersects.length > 0) {
        const cellObject = intersects[0].object;
        const cellPosition = this.board.getCellPositionFromObject(cellObject);
        
        if (cellPosition) {
          const skill = this.selectedUnit.skills[this.currentSkillIndex];
          const validTargets = this.unitManager.getValidSkillTargets(
            this.selectedUnit, 
            skill
          );
          
          // Лог: Показываем кликнутую клетку и валидные цели
          console.log(`Клик в режиме skill по ${cellPosition.x},${cellPosition.z}. Валидные цели для ${skill.name}:`, JSON.stringify(validTargets));

          if (validTargets.some(pos => pos.x === cellPosition.x && pos.z === cellPosition.z)) {
            console.log('Цель валидна, запускаю анимацию и применяю скилл'); 

            // --- Вызов анимации скилла ---
            const caster = this.selectedUnit;
            const targetUnit = this.unitManager.getUnitAtPosition(cellPosition);
            const animationTarget = targetUnit || cellPosition; // Передаем либо юнита, либо координаты
            // TODO: Получить реальный список AOE целей из UnitManager
            const aoeTargets = []; 
            if (this.skillAnimator) { // Проверяем, что аниматор инициализирован
                 this.skillAnimator.playSkillAnimation(skill, caster, animationTarget, aoeTargets);
            }
            // --- Конец вызова анимации ---
            
            this.handleSkill(this.selectedUnit, this.currentSkillIndex, cellPosition.x, cellPosition.z);
            
            // После применения навыка возвращаемся в режим выбора
            this.gameMode = 'select';
            this.board.resetHighlights();
            this.uiManager.updateUI();
            this.currentSkillIndex = -1;
            const skillPanel = document.getElementById('skill-panel');
            if (skillPanel) skillPanel.style.display = 'none';
            // selectedUnit уже null после completeTurn
            // --- КОНЕЦ ПЕРЕМЕЩЕНИЯ --- 
            
            // Автоматически заканчиваем ход
            this.selectedUnit = null;
          }
        }
      }
    }
  }
  
  selectUnit(unit) {
    // Если юнит уже выбран и это тот же юнит, снимаем выделение
    if (this.selectedUnit && this.selectedUnit === unit) {
      this.selectUnit(null);
      return;
    }
    
    // Если выбран другой юнит, сначала снимаем выделение с него
    if (this.selectedUnit) {
      this.selectedUnit.deselect();
      // Скрываем информацию о предыдущем юните
      this.uiManager.hideSelectedUnitInfo(); 
    }
    
    // Обновляем выбранный юнит
    this.selectedUnit = unit;
    
    // Если передан юнит, то выбираем его
    if (unit) {
      // Проверяем, не оглушена ли фигура
      if (typeof unit.isStunned === 'function' && unit.isStunned()) {
        console.warn(`Фигура ${unit.type} оглушена и не может быть выбрана в этот ход!`);
        
        // Показываем информацию об оглушении
        if (this.uiManager && typeof this.uiManager.showMessage === 'function') {
          this.uiManager.showMessage("Фигура оглушена и не может быть выбрана!");
        }
        
        // Сразу снимаем выделение и выходим, НЕ завершая ход
        this.selectedUnit = null; 
        
        return;
      }
      
      this.selectedUnit.select();
      this.uiManager.showSelectedUnit(this.selectedUnit);
      this.gameMode = 'select'; // Переключаемся в режим выбора действия
      
      // Сбрасываем все подсветки на доске
      this.board.resetHighlights();
      
      // Подсвечиваем клетку под выбранной фигурой
      const cellPosition = unit.position;
      this.board.highlightCell(cellPosition.x, cellPosition.z, 'select');
      
      // --- ИЗМЕНЕНА ЛОГИКА АВТОМАТИЧЕСКОГО ПЕРЕКЛЮЧЕНИЯ В РЕЖИМ ХОДА ---
      let shouldStartMoveMode = false;
      if (this.playMode === 'singlePlayer') {
          // В одиночной игре начинаем ход, если цвет фигуры совпадает с текущим ходом
          if (this.selectedUnit && this.currentTurnColor === this.selectedUnit.ownerColor) {
              shouldStartMoveMode = true;
          }
      } else if (this.playMode === 'multiplayer') {
          // В мультиплеере начинаем ход, если это наша фигура и наш ход
          if (this.selectedUnit && this.currentTurnColor === this.myColor && this.selectedUnit.ownerColor === this.myColor) {
              shouldStartMoveMode = true;
          }
      }
      
      if (shouldStartMoveMode) {
      // --- КОНЕЦ ИЗМЕНЕНИЯ ЛОГИКИ --- 
        this.startMoveMode();
      }
    } else {
      // Если передан null, снимаем выделение и очищаем UI
      this.board.resetHighlights();
      this.uiManager.hideSelectedUnitInfo();
      this.gameMode = 'select';
    }
  }
  
  moveUnit(unit, targetPosition) {
    // Проверяем, не оглушен ли юнит
    if (typeof unit.isStunned === 'function' && unit.isStunned()) {
      console.warn(`Юнит ${unit.type} оглушен и не может двигаться`);
      
      // Показываем сообщение об оглушении
      if (this.uiManager && typeof this.uiManager.showMessage === 'function') {
        this.uiManager.showMessage("Фигура оглушена и не может ходить!");
      }
      
      return false;
    }
    
    // Проверяем, есть ли на целевой клетке другая фигура
    const targetUnit = this.unitManager.getUnitAtPosition(targetPosition);
    
    if (targetUnit) {
      // Если есть фигура и она противника - атакуем
      if (targetUnit.ownerColor !== unit.ownerColor) {
        this.unitManager.attackUnit(unit, targetUnit);
        
        // Если фигура уничтожена, занимаем ее место
        if (targetUnit.hp <= 0) {
          this.unitManager.moveUnit(unit, targetPosition);
        }
      }
    } else {
      // Если клетка пуста, просто перемещаем фигуру
      this.unitManager.moveUnit(unit, targetPosition);
    }
    
    // Обновляем UI после перемещения
    this.uiManager.updateUI();
    this.selectedUnit = null;
    
    // Автоматически заканчиваем ход
    this.completeTurn();
    
    return true;
  }
  
  startMoveMode() {
    console.log("Вызван startMoveMode для:", this.selectedUnit?.type);
    if (this.selectedUnit) {
      // --- ИЗМЕНЕНА ЛОГИКА ПРОВЕРКИ ПЕРЕД НАЧАЛОМ РЕЖИМА ХОДА ---
      let canStartMove = false;
      if (this.playMode === 'singlePlayer') {
          // В одиночной игре разрешаем, если цвет фигуры совпадает с текущим ходом
          if (this.currentTurnColor === this.selectedUnit.ownerColor) {
              canStartMove = true;
          }
      } else if (this.playMode === 'multiplayer') {
          // В мультиплеере разрешаем, если это наша фигура и наш ход
          if (this.currentTurnColor === this.myColor && this.selectedUnit.ownerColor === this.myColor) {
              canStartMove = true;
          }
      }

      if (canStartMove) {
      // --- КОНЕЦ ИЗМЕНЕНИЯ ЛОГИКИ --- 
        // Проверяем, не оглушена ли фигура
        const isStunned = typeof this.selectedUnit.isStunned === 'function' 
          ? this.selectedUnit.isStunned() 
          : false;
        
        if (isStunned) {
          console.warn("Фигура оглушена и не может ходить в этот ход!");
          // Отображаем информацию об оглушении
          if (this.uiManager && typeof this.uiManager.showMessage === 'function') {
            this.uiManager.showMessage("Фигура оглушена и не может ходить!");
          } else {
            console.error("Не удается отобразить сообщение, UIManager не инициализирован корректно");
          }
          this.selectUnit(null);
          return;
        }
        
        this.gameMode = 'move';
        this.board.resetHighlights();
        
        // Подсвечиваем клетку под выбранной фигурой
        const cellPosition = this.selectedUnit.position;
        this.board.highlightCell(cellPosition.x, cellPosition.z, 'select');
        
        // Отображаем все доступные клетки для перемещения
        const validMoves = this.unitManager.getValidMoves(this.selectedUnit);
        console.log("Найденные ходы:", JSON.stringify(validMoves));
        
        if (validMoves.length === 0) {
          console.warn("У выбранной фигуры нет доступных ходов!");
        }
        
        validMoves.forEach(position => {
          // Определяем, атака это или ход
          const targetUnit = this.unitManager.getUnitAtPosition(position);
          const highlightKey = targetUnit ? 'attack' : 'move'; // Красный для атаки, желтый для хода
          this.board.highlightCell(position.x, position.z, highlightKey);
        });
      } else {
        console.warn(`Не могу начать режим хода: фигура ${this.selectedUnit.ownerColor}, мой цвет ${this.myColor}, ход ${this.currentTurnColor}`);
      }
    } else {
      console.warn("Не могу начать режим хода: фигура не выбрана");
    }
  }
  
  useSkill(skillIndex) {
    if (this.selectedUnit) {
      // --- ИЗМЕНЕНА ЛОГИКА ПРОВЕРКИ ПЕРЕД ИСПОЛЬЗОВАНИЕМ НАВЫКА ---
      let canUseSkill = false;
      if (this.playMode === 'singlePlayer') {
          // В одиночной игре разрешаем, если цвет фигуры совпадает с текущим ходом
          if (this.currentTurnColor === this.selectedUnit.ownerColor) {
              canUseSkill = true;
          }
      } else if (this.playMode === 'multiplayer') {
          // В мультиплеере разрешаем, если это наша фигура и наш ход
          if (this.currentTurnColor === this.myColor && this.selectedUnit.ownerColor === this.myColor) {
              canUseSkill = true;
          }
      }
      
      if (canUseSkill) {
      // --- КОНЕЦ ИЗМЕНЕНИЯ ЛОГИКИ --- 
        // Проверяем, не оглушена ли фигура
        const isStunned = typeof this.selectedUnit.isStunned === 'function' 
          ? this.selectedUnit.isStunned() 
          : false;
        
        if (isStunned) {
          console.warn("Фигура оглушена и не может использовать навыки в этот ход!");
          if (this.uiManager && typeof this.uiManager.showMessage === 'function') {
            this.uiManager.showMessage("Фигура оглушена и не может использовать навыки!");
          } else {
            console.error("Не удается отобразить сообщение, UIManager не инициализирован корректно");
          }
          this.selectUnit(null);
          return;
        }
        
        const skill = this.selectedUnit.skills[skillIndex];
        
        if (skill && this.selectedUnit.mp >= skill.manaCost && skill.currentCooldown === 0) {
          this.gameMode = 'skill';
          this.currentSkillIndex = skillIndex;
          this.board.resetHighlights();
          
          // Подсвечиваем клетку под выбранной фигурой
          const cellPosition = this.selectedUnit.position;
          this.board.highlightCell(cellPosition.x, cellPosition.z, 'select');
          
          // Отображаем все доступные клетки для применения навыка
          const validTargets = this.unitManager.getValidSkillTargets(this.selectedUnit, skill);
          validTargets.forEach(position => {
             // Используем ключ 'skill' для подсветки
            this.board.highlightCell(position.x, position.z, 'skill'); 
          });
        }
      } else {
          console.warn(`Нельзя использовать навык: фигура ${this.selectedUnit.ownerColor}, мой цвет ${this.myColor}, ход ${this.currentTurnColor}`);
      }
    }
  }
  
  completeTurn() {
    // --- DEBUG: Лог начала выполнения --- 
    console.log(`[completeTurn] === НАЧАЛО === Текущий ход ДО: ${this.currentTurnColor}, Режим игры: ${this.gameMode}`);
    // --- END DEBUG --- 
    
    // --- Сначала отправляем ход, ПОТОМ проверяем gameOver --- 
    
    // Отправляем ход на сервер, если это сетевая игра и наш ход
    // и если есть данные о последнем ходе
    if (this.playMode === 'multiplayer' && this.currentTurnColor === this.myColor && this.lastMoveData && sendWebSocketMessage) {
      console.log('[completeTurn] Отправка хода на сервер ПЕРЕД проверкой gameOver:', this.lastMoveData);
      sendWebSocketMessage(this.lastMoveData);
      this.lastMoveData = null; // Очищаем после отправки
    }
    
    // --- Теперь проверяем, не закончилась ли игра (например, после атаки на короля) ---
    if (this.gameMode === 'gameOver') {
        console.log('[completeTurn] Игра уже окончена (проверка ПОСЛЕ отправки), дальнейшее завершение хода отменено.');
        return; // Если игра закончилась, выходим
    }
    // --- Конец проверки gameOver ---
    
    // Сбрасываем режим и выделение, если игра НЕ закончилась
    this.selectedUnit = null;
    this.gameMode = 'select';
    this.board.resetHighlights();
    
    // Определяем, чей ход был
    const previousTurnColor = this.currentTurnColor;
    
    // Передаем ход
    this.currentTurnColor = (previousTurnColor === 'white') ? 'black' : 'white';
    console.log(`[completeTurn] Ход передан: теперь ходят ${this.currentTurnColor}`);
    
    // Обновляем состояние всех фигур ПЕРЕД переключением хода
    // Состояние обновляется для игрока, чей ход ЗАКОНЧИЛСЯ
    this.unitManager.updateUnitsState(previousTurnColor);

    // Перепроверяем наличие королей (на всякий случай, если gameOver не сработал ранее)
    const whiteKingExists = this.unitManager.units.some(unit => unit.type === 'king' && unit.ownerColor === 'white');
    const blackKingExists = this.unitManager.units.some(unit => unit.type === 'king' && unit.ownerColor === 'black');
    
    // Если один из королей отсутствует, завершаем игру
    if (!whiteKingExists) {
      this.gameOver('black'); // Победа черных
      return;
    } else if (!blackKingExists) {
      this.gameOver('white'); // Победа белых
      return;
    }

    // Обновляем UI
    this.uiManager.updateTurnInfo(this.currentTurnColor);
    this.uiManager.hideSelectedUnitInfo();
    this.uiManager.updateUI();
  }
  
  setupInitialPieces(playerColor) {
    console.log(`Расстановка фигур для игрока с цветом: ${playerColor}`);
    // Определяем, какой цвет соответствует флагу isPlayer = true для этого клиента
    // const playerIsWhite = (playerColor === 'white'); // УДАЛЯЕМ ЭТО

    // --- Определяем строки для цветов ---
    const whiteColorString = 'white';
    const blackColorString = 'black';

    // --- Расстановка белых фигур ---
    // Используем whiteColorString вместо whiteOwnerColor
    this.unitManager.createUnit('pawn', { x: 0, z: 1 }, whiteColorString);
    this.unitManager.createUnit('pawn', { x: 1, z: 1 }, whiteColorString);
    this.unitManager.createUnit('pawn', { x: 2, z: 1 }, whiteColorString);
    this.unitManager.createUnit('pawn', { x: 3, z: 1 }, whiteColorString);
    this.unitManager.createUnit('pawn', { x: 4, z: 1 }, whiteColorString);
    this.unitManager.createUnit('pawn', { x: 5, z: 1 }, whiteColorString);
    this.unitManager.createUnit('pawn', { x: 6, z: 1 }, whiteColorString);
    this.unitManager.createUnit('pawn', { x: 7, z: 1 }, whiteColorString);

    this.unitManager.createUnit('rook', { x: 0, z: 0 }, whiteColorString);
    this.unitManager.createUnit('knight', { x: 1, z: 0 }, whiteColorString);
    this.unitManager.createUnit('bishop', { x: 2, z: 0 }, whiteColorString);
    this.unitManager.createUnit('queen', { x: 3, z: 0 }, whiteColorString);
    this.unitManager.createUnit('king', { x: 4, z: 0 }, whiteColorString);
    this.unitManager.createUnit('bishop', { x: 5, z: 0 }, whiteColorString);
    this.unitManager.createUnit('knight', { x: 6, z: 0 }, whiteColorString);
    this.unitManager.createUnit('rook', { x: 7, z: 0 }, whiteColorString);

    // --- Расстановка черных фигур ---
    // Используем blackColorString вместо blackOwnerColor
    this.unitManager.createUnit('pawn', { x: 0, z: 6 }, blackColorString);
    this.unitManager.createUnit('pawn', { x: 1, z: 6 }, blackColorString);
    this.unitManager.createUnit('pawn', { x: 2, z: 6 }, blackColorString);
    this.unitManager.createUnit('pawn', { x: 3, z: 6 }, blackColorString);
    this.unitManager.createUnit('pawn', { x: 4, z: 6 }, blackColorString);
    this.unitManager.createUnit('pawn', { x: 5, z: 6 }, blackColorString);
    this.unitManager.createUnit('pawn', { x: 6, z: 6 }, blackColorString);
    this.unitManager.createUnit('pawn', { x: 7, z: 6 }, blackColorString);

    this.unitManager.createUnit('rook', { x: 0, z: 7 }, blackColorString);
    this.unitManager.createUnit('knight', { x: 1, z: 7 }, blackColorString);
    this.unitManager.createUnit('bishop', { x: 2, z: 7 }, blackColorString);
    this.unitManager.createUnit('queen', { x: 3, z: 7 }, blackColorString);
    this.unitManager.createUnit('king', { x: 4, z: 7 }, blackColorString);
    this.unitManager.createUnit('bishop', { x: 5, z: 7 }, blackColorString);
    this.unitManager.createUnit('knight', { x: 6, z: 7 }, blackColorString);
    this.unitManager.createUnit('rook', { x: 7, z: 7 }, blackColorString);
    
    // Обновляем UI
    this.uiManager.updateUI();
  }

  // Метод для добавления колбэка анимации
  addAnimationCallback(callback) {
      if (typeof callback === 'function' && !this.animationCallbacks.includes(callback)) {
          this.animationCallbacks.push(callback);
      }
  }
  
  // Метод для удаления колбэка анимации
  removeAnimationCallback(callback) {
      this.animationCallbacks = this.animationCallbacks.filter(cb => cb !== callback);
  }

  /**
   * Получает мировые координаты центра указанной клетки доски.
   * @param {number} x - Координата X на доске (0-7).
   * @param {number} z - Координата Z на доске (0-7).
   * @returns {THREE.Vector3 | null} Мировые координаты или null, если доска не инициализирована.
   */
  getTileWorldPosition(x, z) {
      if (this.board) {
          // Делегируем вызов методу доски
          const worldX = this.board.getWorldX(x);
          const worldZ = this.board.getWorldZ(z);
          return new THREE.Vector3(worldX, 0, worldZ); // Y=0, т.к. это позиция на плоскости доски
      } else {
          console.error("Попытка получить мировые координаты до инициализации доски.");
          return null;
      }
  }

  // НОВЫЙ МЕТОД для обработки конца игры
  gameOver(winnerColor) {
    console.log(`Игра окончена! Победитель: ${winnerColor}`);
    
    // Установка режима gameOver
    this.gameMode = 'gameOver'; // Устанавливаем режим, чтобы блокировать клики
    
    // Отключаем выбор фигур
    this.selectedUnit = null;
    this.board.resetHighlights();
    
    // Отображаем сообщение о победе/поражении
    const message = winnerColor === this.myColor ? "Вы победили!" : "Вы проиграли!";
    // TODO: Передать сообщение в index.js для отображения через showGameMessage?
    // Пока оставим старый способ отображения для gameOver
    
    // Создаем контейнер для сообщения и кнопки (если не используется showGameMessage)
    let gameOverContainer = document.getElementById('game-over-container');
    if (!gameOverContainer) {
        gameOverContainer = document.createElement('div');
        gameOverContainer.id = 'game-over-container';
        gameOverContainer.style.position = 'absolute';
        gameOverContainer.style.top = '40%';
        gameOverContainer.style.left = '50%';
        gameOverContainer.style.transform = 'translate(-50%, -50%)';
        gameOverContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        gameOverContainer.style.padding = '30px';
        gameOverContainer.style.borderRadius = '10px';
        gameOverContainer.style.color = '#ffffff';
        gameOverContainer.style.textAlign = 'center';
        gameOverContainer.style.fontFamily = 'Arial, sans-serif';
        gameOverContainer.style.zIndex = '1000';
        gameOverContainer.style.border = '2px solid #aaa';
        gameOverContainer.style.boxShadow = '0 0 15px rgba(0,0,0,0.5)';

        // Добавляем сообщение о победе
        const messageElement = document.createElement('h2');
        messageElement.id = 'game-over-message';
        messageElement.style.marginBottom = '25px';
        messageElement.style.fontSize = '24px';
        gameOverContainer.appendChild(messageElement);

        // Создаем кнопку "Вернуться в меню"
        const menuButton = document.createElement('button');
        menuButton.id = 'game-over-menu-btn';
        menuButton.textContent = 'Вернуться в меню';
        menuButton.style.padding = '12px 25px';
        menuButton.style.fontSize = '18px';
        menuButton.style.backgroundColor = '#2a5298'; // Цвет из mode-button
        menuButton.style.color = 'white';
        menuButton.style.border = 'none';
        menuButton.style.borderRadius = '5px';
        menuButton.style.cursor = 'pointer';
        menuButton.style.transition = 'background-color 0.3s ease';

        menuButton.addEventListener('mouseover', () => { menuButton.style.backgroundColor = '#3a62a8'; });
        menuButton.addEventListener('mouseout', () => { menuButton.style.backgroundColor = '#2a5298'; });

        // Обработчик для возврата в меню (используем функцию из index.js, если доступна)
        menuButton.addEventListener('click', () => {
            // Просто перезагружаем страницу, т.к. прямого доступа к returnToMainMenu нет
            window.location.reload(); 
        });
        gameOverContainer.appendChild(menuButton);
        document.body.appendChild(gameOverContainer);
    }

    // Обновляем текст сообщения и показываем контейнер
    const msgElement = gameOverContainer.querySelector('#game-over-message');
    if (msgElement) msgElement.textContent = message;
    gameOverContainer.style.display = 'block';
    
    // Удаляем слушатели событий мыши для предотвращения дальнейших ходов
    // Используем сохраненные ссылки на привязанные функции
    window.removeEventListener('click', this.boundOnMouseClick);
    window.removeEventListener('mousemove', this.boundOnMouseMove);
  }

  // НОВЫЙ МЕТОД для сброса игры к начальному состоянию
  resetGame(playerColor = 'white') { // По умолчанию игрок играет белыми
    console.log(`Сброс игры. Игрок играет за: ${playerColor}`);
    
    this.myColor = playerColor; // Сохраняем цвет игрока
    
    // 1. Удаляем все существующие юниты
    if (this.unitManager) {
      this.unitManager.removeAllUnits();
    }
    
    // 2. Сбрасываем состояние игры
    this.selectedUnit = null;
    this.targetUnit = null;
    this.selectedSkill = null;
    this.gameMode = 'select'; // Возвращаемся в режим выбора
    
    // 3. Устанавливаем, чей ход первый
    // Если игрок играет белыми, его ход первый. Если черными - ход противника первый.
    this.currentTurnColor = 'white'; // Всегда начинают белые
    console.log(`Первый ход: ${this.currentTurnColor}`);
    
    // 4. Сбрасываем подсветку на доске
    if (this.board) {
        this.board.resetHighlights();
    }

    // 5. Выполняем начальную расстановку, передавая цвет игрока
    this.setupInitialPieces(this.myColor);
    
    // 6. Обновляем UI, чтобы отобразить правильный ход и сбросить панель действий
    if (this.uiManager) {
        this.uiManager.updateTurnInfo(this.currentTurnColor);
        this.uiManager.hideSelectedUnitInfo();
        this.uiManager.updateUI();
    }

    // 7. TODO: Сбросить кулдауны всех скиллов у всех юнитов? (Если они сохраняются между играми)
    // Обычно это делается при создании юнита, но на всякий случай.
    if (this.unitManager) {
      this.unitManager.units.forEach(unit => {
        if (unit.skills) {
          unit.skills.forEach(skill => skill.currentCooldown = 0);
        }
        // Также сбросим эффекты
        unit.effects = [];
        unit.updateStatusIndicators();
      });
    }

    console.log("Игра сброшена к начальному состоянию.");
    
    // 8. Поворачиваем камеру, если игрок играет черными
    if (this.controls) { // Убедимся, что контролы инициализированы
      this.controls.reset(); // Сбрасываем состояние контроллера перед установкой новой позиции
    }
    if (this.myColor === 'white') { // Если игрок белый, поворачиваем камеру (т.к. дефолт - вид черных)
      // Поворачиваем камеру на 180 градусов вокруг оси Y
      // и немного смещаем, чтобы центр остался прежним
      this.camera.position.set(0, 120, -120); // Перемещаем назад
      this.controls.target.set(0, 0, 0); // Убедимся, что цель в центре
      this.camera.lookAt(0, 0, 0);
      this.controls.update(); // Обновляем контроллер
      console.log("Камера повернута для белого игрока.");
    } else { // Если игрок черный, используем стандартную позицию
      // Возвращаем камеру в стандартное положение для белых
      this.camera.position.set(0, 120, 120);
      this.controls.target.set(0, 0, 0);
      this.camera.lookAt(0, 0, 0);
      this.controls.update();
      console.log("Камера установлена для черного игрока (стандартный вид).");
    }
  }

  // --- Обработка действий игрока --- 

  handleMove(unit, targetX, targetZ) {
    console.log(`Выполняем ход: ${unit.type} на (${targetX},${targetZ})`);
    const initialUnitPos = { x: unit.position.x, z: unit.position.z }; // Запоминаем позицию ДО хода
    this.unitManager.moveUnit(unit, { x: targetX, z: targetZ });
    
    // Подготавливаем данные для отправки на сервер
    this.lastMoveData = {
        type: 'move',
        unitPos: initialUnitPos, // Отправляем начальную позицию
        targetPos: { x: targetX, z: targetZ }
    };
    
    // Сбрасываем выделение и режим
    this.completeTurn();
  }
  
  handleAttack(unit, targetUnit) {
    console.log(`Выполняем атаку: ${unit.type} на ${targetUnit.type}`);
    const attackerPos = { x: unit.position.x, z: unit.position.z }; // Запоминаем ДО атаки
    const targetPos = { x: targetUnit.position.x, z: targetUnit.position.z };
    
    // Выполняем атаку. Эта функция может изменить gameMode на 'gameOver'
    this.unitManager.attackUnit(unit, targetUnit); 
    
    // Подготавливаем данные для отправки на сервер
    this.lastMoveData = {
        type: 'attack',
        unitPos: attackerPos,
        targetPos: targetPos
    };
    
    // Вызываем completeTurn ВСЕГДА после атаки. 
    // completeTurn сама проверит, не закончилась ли игра.
    this.completeTurn();
  }
  
  handleSkill(unit, skillIndex, targetX, targetZ) {
    console.log(`Выполняем навык ${skillIndex}: ${unit.type} на (${targetX},${targetZ})`);
    const initialUnitPos = { x: unit.position.x, z: unit.position.z }; // Запоминаем позицию ДО использования навыка
    const skillUsedSuccessfully = this.unitManager.useSkill(unit, skillIndex, { x: targetX, z: targetZ });
    
    // Запускаем анимацию, если она есть
    if (this.skillAnimator && unit.skills && unit.skills[skillIndex]?.animation) {
       // ... (логика анимации) ...
    }
    
    if (skillUsedSuccessfully) {
        // Подготавливаем данные для отправки на сервер
        this.lastMoveData = {
            type: 'skill',
            unitPos: initialUnitPos, // Отправляем начальную позицию
            skillIndex: skillIndex,
            targetPos: { x: targetX, z: targetZ }
        };
        this.completeTurn();
        
        // --- ПЕРЕМЕЩАЕМ СБРОС СОСТОЯНИЯ СЮДА --- 
        // Выполняется ПОСЛЕ завершения хода
        this.gameMode = 'select'; 
        this.board.resetHighlights();
        this.uiManager.updateUI(); 
        this.currentSkillIndex = -1; 
        const skillPanel = document.getElementById('skill-panel');
        if (skillPanel) skillPanel.style.display = 'none';
        // selectedUnit уже null после completeTurn
        // --- КОНЕЦ ПЕРЕМЕЩЕНИЯ --- 
        
    } else {
        // Если навык не удалось использовать (не хватило маны и т.д.), 
        // возвращаемся в режим выбора без завершения хода
        console.log("Навык не был использован, возвращаемся в режим выбора.");
        this.gameMode = 'select';
        this.board.resetHighlights();
        this.uiManager.showSelectedUnit(unit); // Обновляем UI, чтобы показать актуальную ману/кд
    }
  }
  
  // --- Обработка хода соперника ---
  applyOpponentMove(moveData) {
    console.log('[applyOpponentMove] Получен ход соперника (сырые данные):', JSON.stringify(moveData)); // Лог 1: Сырые данные
    console.log(`[applyOpponentMove] Мой цвет: ${this.myColor}, Текущий ход (локально ДО обработки): ${this.currentTurnColor}`); // Лог 2: Цвет игрока и чей ход ЛОКАЛЬНО

    if (this.playMode !== 'multiplayer') { 
      // Игнорируем ход соперника, если не сетевая игра
      console.warn('[applyOpponentMove] Игнорируем ход соперника (не сетевой режим)');
      return;
    }
    
    // Проверяем, не пришел ли ход от противника, когда мы считаем, что сейчас НАШ ход?
    // Это может указывать на рассинхрон или дубликат сообщения
    if (this.currentTurnColor === this.myColor) {
        console.warn(`[applyOpponentMove] ВНИМАНИЕ: Получен ход противника (${moveData.type}), но локально currentTurnColor (${this.currentTurnColor}) совпадает с myColor (${this.myColor}). Возможен рассинхрон или дубликат.`);
        // Решаем пока продолжать обработку, но следим за логами
    }

    // Используем координаты напрямую из данных сервера, без преобразования
    console.log('[applyOpponentMove] Используемые координаты (из данных сервера):', JSON.stringify({ unitPos: moveData.unitPos, targetPos: moveData.targetPos })); // Лог 3: Используемые координаты

    const unitPos = moveData.unitPos; // Используем координаты напрямую из данных сервера
    const targetPos = moveData.targetPos; // Используем координаты напрямую из данных сервера

    const unit = this.unitManager.getUnitAtPosition(unitPos);

    // --- Ключевая проверка ---
    // 1. Юнит должен существовать на стартовой позиции.
    // 2. Найденный юнит должен принадлежать ПРОТИВНИКУ (его цвет НЕ совпадает с нашим).
    if (!unit) {
      console.error('[applyOpponentMove] ОШИБКА: Юнит противника не найден на стартовой позиции', unitPos);
      // Возможно рассинхронизация состояния доски?
      return; // Игнорируем ход
    }

    console.log(`[applyOpponentMove] Найден юнит: ${unit.type}, Цвет: ${unit.ownerColor} в позиции (${unitPos.x}, ${unitPos.z})`);

    if (unit.ownerColor === this.myColor) {
        console.error(`[applyOpponentMove] КРИТИЧЕСКАЯ ОШИБКА: Попытка выполнить ход СВОИМ юнитом (${unit.type}, ${unit.ownerColor}) по данным противника! Стартовая позиция противника (${unitPos.x}, ${unitPos.z}) указывает на нашего юнита.`);
        // Это ошибка в логике сервера или клиента.
        return; // Игнорируем ход, чтобы не сломать игру.
    }

    // Если мы дошли сюда, значит unit найден и принадлежит противнику.
    console.log(`[applyOpponentMove] Проверка пройдена: Юнит ${unit.type} (${unit.ownerColor}) принадлежит противнику.`);

    // Выполняем действие в зависимости от типа хода
    let actionSuccessful = false;
    switch (moveData.type) {
      case 'move':
        console.log(`[applyOpponentMove] [Opponent] Перемещение ${unit.type} с (${unitPos.x},${unitPos.z}) на (${targetPos.x},${targetPos.z})`);
        this.unitManager.moveUnit(unit, targetPos);
        actionSuccessful = true;
        break;
      case 'attack':
        const targetUnit = this.unitManager.getUnitAtPosition(targetPos);
        if (targetUnit) {
          // Дополнительная проверка: цель атаки должна быть НАШИМ юнитом
          if (targetUnit.ownerColor !== this.myColor) {
            console.error(`[applyOpponentMove] ОШИБКА АТАКИ: Противник (${unit.ownerColor}) пытается атаковать не нашего юнита (${targetUnit.ownerColor})!`);
            actionSuccessful = false; // Считаем ход неуспешным
          } else {
            console.log(`[applyOpponentMove] [Opponent] Атака ${unit.type} (${unitPos.x},${unitPos.z}) на ${targetUnit.type} (${targetPos.x},${targetPos.z})`);
            const isKilled = this.unitManager.attackUnit(unit, targetUnit);
            actionSuccessful = true;
            // Если юнит убит, gameOver вызывается внутри removeUnit
          }
        } else {
          console.error('[applyOpponentMove] Ход соперника: Цель атаки не найдена в позиции', targetPos);
        }
        break;
      case 'skill':
        console.log(`[applyOpponentMove] [Opponent] Использование навыка ${moveData.skillIndex} юнитом ${unit.type} (${unitPos.x},${unitPos.z}) на (${targetPos.x},${targetPos.z})`);
        actionSuccessful = this.unitManager.useSkill(unit, moveData.skillIndex, targetPos);
        // TODO: Запустить анимацию навыка соперника?
        break;
      default:
        console.warn('[applyOpponentMove] Получен неизвестный тип хода от соперника:', moveData.type);
        return; // Не передаем ход, если действие непонятно
    }

    // Передаем ход нам только если действие было успешным
    if (actionSuccessful && this.gameMode !== 'gameOver') {
        // Определяем цвет противника, чей ход только что закончился
        const opponentColor = this.myColor === 'white' ? 'black' : 'white';
        console.log(`[applyOpponentMove] Ход противника (${opponentColor}) завершен успешно.`);

        // Передаем ход НАМ
        this.currentTurnColor = this.myColor;
        console.log(`[applyOpponentMove] Ход передан мне (${this.currentTurnColor}).`);

        // Обновляем состояние юнитов ПРОТИВНИКА (чей ход только что закончился)
        this.unitManager.updateUnitsState(opponentColor);
        console.log(`[applyOpponentMove] Обновлено состояние юнитов цвета: ${opponentColor}`);

        // Обновляем UI
        this.uiManager.updateTurnInfo(this.currentTurnColor);
        this.uiManager.updateUI();
        console.log("[applyOpponentMove] UI обновлен.");
    }
  }
}