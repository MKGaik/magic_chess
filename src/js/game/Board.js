import * as THREE from 'three';
// Убираем загрузчики GLTF/DRACO
// import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
// import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';

export class Board {
  constructor(scene) {
    this.scene = scene;
    // Убираем this.boardModel, т.к. модель больше не грузим
    // this.boardModel = null; 
    this.boardGroup = new THREE.Group(); // Группа для всех объектов доски (видимых и невидимых)

    // Увеличиваем размер клеток для лучшей видимости
    this.squareSize = 15.0; 
    this.size = 8;
    
    this.squarePlanes = []; // Невидимые плоскости для Raycaster
    this.visualSquares = []; // Видимые квадраты доски
    this.squareData = []; 
    
    this.selectedSquare = null;
    // Убираем hoverSquare и possibleMoves, они не используются
    // this.hoverSquare = null;
    // this.possibleMoves = [];
    
    this.highlightMaterials = new Map();

    // Упрощенные материалы для доски (без теней и сложной обработки освещения)
    this.lightMaterial = new THREE.MeshLambertMaterial({ 
      color: 0xe0cfa6,
      emissive: 0x222222,
      side: THREE.FrontSide
    });
    
    this.darkMaterial = new THREE.MeshLambertMaterial({ 
      color: 0x6b4a38,
      emissive: 0x111111,
      side: THREE.FrontSide
    });
    // Сохраняем исходные материалы для сброса подсветки
    this.originalMaterials = []; 
  }

  // Убираем loadBoardTextures
  /* async loadBoardTextures() { ... } */

  // Переделываем init для создания процедурной доски
  async init() {
    try {
      // Размещаем всю группу доски (с центром в 0,0) на нужной высоте
      this.boardGroup.position.y = 0; // Поднимаем на 0 для лучшей видимости

      this.createVisualBoard(); // Создаем видимую часть доски
      this.createRaycastPlanes(); // Создаем невидимые плоскости для кликов
      
      this.createIndicatorMaterials(); // Материалы для подсветки остаются

      this.scene.add(this.boardGroup); // Добавляем группу на сцену

      // Центрируем камеру на доске
      this.centerCamera();

    } catch (error) {
      console.error('Ошибка при инициализации доски:', error);
      throw error;
    }
  }

  centerCamera() {
    // Если в сцене есть камера, позиционируем ее для лучшего обзора доски
    if (this.scene.camera) {
      const boardWidth = this.size * this.squareSize;
      // Позиционируем камеру так, чтобы вся доска была видна
      this.scene.camera.position.set(0, boardWidth * 1.2, boardWidth * 0.8);
      this.scene.camera.lookAt(0, 0, 0);
    }
  }

  createVisualBoard() {
    const boardWidth = this.size * this.squareSize;
    const boardHeight = this.size * this.squareSize;
    const boardThickness = 1.0; // Толщина доски

    // Создаем единую геометрию доски - плоский куб
    const boardGeometry = new THREE.BoxGeometry(boardWidth, boardThickness, boardHeight);
    
    // Создаем специальный материал для всей доски, способный принимать тени
    const boardMaterial = new THREE.MeshStandardMaterial({
      map: createCheckerboardTexture(this.size, this.size),
      side: THREE.FrontSide,
      roughness: 0.9, // Делаем доску менее глянцевой
      metalness: 0.1
    });
    
    // Создаем меш для доски
    const boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);
    boardMesh.receiveShadow = true; // Доска принимает тени
    boardMesh.castShadow = false; // Сама доска не отбрасывает тень (или можно включить, если нужно)
    
    // Позиционируем доску
    boardMesh.position.set(0, -boardThickness/2, 0);
    
    // Добавляем доску в группу
    this.boardGroup.add(boardMesh);
    
    // Создаем виртуальный массив для подсветки клеток
    for (let x = 0; x < this.size; x++) {
      this.visualSquares[x] = [];
      this.originalMaterials[x] = [];
      for (let z = 0; z < this.size; z++) {
        // Создаем временный меш для каждой клетки, используемый только для подсветки
        const highlightGeometry = new THREE.PlaneGeometry(this.squareSize, this.squareSize);
        const isDark = (x + z) % 2 === 1;
        const material = isDark ? this.darkMaterial : this.lightMaterial;
        
        const highlightMesh = new THREE.Mesh(highlightGeometry, material);
        highlightMesh.position.set(
          x * this.squareSize - boardWidth / 2 + this.squareSize / 2,
          0.1, // Слегка выше доски для предотвращения z-fighting
          z * this.squareSize - boardHeight / 2 + this.squareSize / 2
        );
        highlightMesh.rotation.x = -Math.PI / 2;
        highlightMesh.visible = false; // По умолчанию скрыт, используется только для подсветки
        
        this.boardGroup.add(highlightMesh);
        this.visualSquares[x][z] = highlightMesh;
        this.originalMaterials[x][z] = material;
      }
    }
    
    // Добавляем рамку для доски
    const frameThickness = this.squareSize / 2;
    const frameHeight = 3.0;
    
    // Создаем 4 стороны рамки
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3020,
      roughness: 0.8,
      metalness: 0.2
    });
    
    // Верхняя рамка
    const topFrame = new THREE.Mesh(
      new THREE.BoxGeometry(boardWidth + 2*frameThickness, frameHeight, frameThickness),
      frameMaterial
    );
    topFrame.position.set(0, -boardThickness-frameHeight/2, -(boardHeight/2 + frameThickness/2));
    topFrame.castShadow = true; // Рамки отбрасывают и принимают тени
    topFrame.receiveShadow = true;
    this.boardGroup.add(topFrame);
    
    // Нижняя рамка
    const bottomFrame = new THREE.Mesh(
      new THREE.BoxGeometry(boardWidth + 2*frameThickness, frameHeight, frameThickness),
      frameMaterial
    );
    bottomFrame.position.set(0, -boardThickness-frameHeight/2, boardHeight/2 + frameThickness/2);
    bottomFrame.castShadow = true;
    bottomFrame.receiveShadow = true;
    this.boardGroup.add(bottomFrame);
    
    // Левая рамка
    const leftFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness, frameHeight, boardHeight),
      frameMaterial
    );
    leftFrame.position.set(-(boardWidth/2 + frameThickness/2), -boardThickness-frameHeight/2, 0);
    leftFrame.castShadow = true;
    leftFrame.receiveShadow = true;
    this.boardGroup.add(leftFrame);
    
    // Правая рамка
    const rightFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness, frameHeight, boardHeight),
      frameMaterial
    );
    rightFrame.position.set(boardWidth/2 + frameThickness/2, -boardThickness-frameHeight/2, 0);
    rightFrame.castShadow = true;
    rightFrame.receiveShadow = true;
    this.boardGroup.add(rightFrame);
    
    // Функция для создания текстуры шахматной доски
    function createCheckerboardTexture(width, height) {
      const size = 512; // Размер текстуры
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      
      const squareSize = size / width;
      
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          const isDark = (x + y) % 2 === 1;
          ctx.fillStyle = isDark ? '#6b4a38' : '#e0cfa6';
          ctx.fillRect(x * squareSize, y * squareSize, squareSize, squareSize);
        }
      }
      
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.magFilter = THREE.NearestFilter; // Для четких краев
      
      return texture;
    }
  }
  
  // Переименовываем createSquares в createRaycastPlanes
  createRaycastPlanes() {
    const planeGeometry = new THREE.PlaneGeometry(this.squareSize, this.squareSize);
    const planeMaterial = new THREE.MeshBasicMaterial({ 
      visible: false, 
      side: THREE.DoubleSide 
    });
    const boardWidth = this.size * this.squareSize;
    const boardHeight = this.size * this.squareSize;
    
    this.squarePlanes = []; // Очищаем массив перед заполнением
    this.squareData = [];   // Очищаем массив перед заполнением

    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        
        // Позиционируем плоскость ВЫШЕ видимых квадратов
        plane.position.set(
          x * this.squareSize - boardWidth / 2 + this.squareSize / 2,
          0.5, // Поднимаем выше видимой поверхности для лучшего обнаружения кликов
          z * this.squareSize - boardHeight / 2 + this.squareSize / 2
        );
        plane.rotation.x = -Math.PI / 2;
        
        const squareData = { x, z, unit: null };
        this.squareData.push(squareData); // Сохраняем данные клетки (индекс будет x * size + z)
        
        plane.userData.boardPosition = { x, z };
        
        this.boardGroup.add(plane); // Добавляем в ту же группу
        this.squarePlanes.push(plane); // Сохраняем для getCellObjects
      }
    }
    
    console.log(`Создано ${this.squarePlanes.length} кликабельных плоскостей`);
  }
  
  createIndicatorMaterials() {
    // Используем MeshBasicMaterial для всех индикаторов (они не требуют освещения)
    // Материал для подсветки возможных ходов (желтый)
    this.highlightMaterials.set('move', new THREE.MeshBasicMaterial({
      color: 0xffff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide
    }));
    // Материал для подсветки возможных атак (красный)
    this.highlightMaterials.set('attack', new THREE.MeshBasicMaterial({
      color: 0xff0000, transparent: true, opacity: 0.5, side: THREE.DoubleSide
    }));
    // Материал для подсветки цели навыка (голубой)
    this.highlightMaterials.set('skill', new THREE.MeshBasicMaterial({
      color: 0x00ffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide
    }));
     // Материал для выделенной клетки (синий)
    this.highlightMaterials.set('select', new THREE.MeshBasicMaterial({
      color: 0x0088ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide
    }));
    // Материал для подсветки при наведении (зеленый - если понадобится)
    this.highlightMaterials.set('hover', new THREE.MeshBasicMaterial({
      color: 0x00ff00, transparent: true, opacity: 0.3, side: THREE.DoubleSide
    }));
  }
  
  getCellObjects() {
    // Возвращаем невидимые плоскости для raycaster
    return this.squarePlanes;
  }
  
  getCellPositionFromObject(object) {
    // Находим индекс клетки в массиве
    const index = this.squarePlanes.indexOf(object);
    if (index >= 0) {
      const x = Math.floor(index / this.size);
      const z = index % this.size;
      return { x, z };
    }
    return null;
  }
  
  // Метод для получения мировой X координаты из координаты клетки
  getWorldX(x) {
    const boardWidth = this.size * this.squareSize;
    return x * this.squareSize - boardWidth / 2 + this.squareSize / 2;
  }
  
  // Метод для получения мировой Z координаты из координаты клетки
  getWorldZ(z) {
    const boardHeight = this.size * this.squareSize;
    return z * this.squareSize - boardHeight / 2 + this.squareSize / 2;
  }
  
  resetHighlights() {
    // Скрываем все меши подсветки
    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        if (this.visualSquares[x]?.[z]) {
          this.visualSquares[x][z].visible = false;
        }
      }
    }
  }
  
  highlightCell(x, z, colorKey) {
    if (x < 0 || x >= this.size || z < 0 || z >= this.size) return;
    
    const visualSquare = this.visualSquares[x]?.[z];
    const highlightMaterial = this.highlightMaterials.get(colorKey);

    if (visualSquare && highlightMaterial) {
      // Делаем меш видимым и применяем материал подсветки
      visualSquare.material = highlightMaterial;
      visualSquare.visible = true;
    } else {
      console.warn(`Не удалось подсветить клетку [${x}, ${z}] ключом ${colorKey}`);
    }
  }
  
  // Метод больше не нужен, т.к. позиционирование происходит относительно центра доски
  /*
  getWorldPositionForCell(x, z) {
    return new THREE.Vector3(
      x * this.squareSize + this.squareSize / 2,
      0.0, 
      z * this.squareSize + this.squareSize / 2
    );
  }
  */
} 