import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { Unit } from './Unit';

export class UnitFactory {
  constructor() {
    this.unitModels = new Map();
    this.textureLoader = new THREE.TextureLoader();
    this.whiteMaterial = null;
    this.blackMaterial = null;
    
    // Настраиваем GLTFLoader с DRACOLoader
    this.loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    // Используем абсолютный путь для декодера, если он на CDN
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/'); 
    this.loader.setDRACOLoader(dracoLoader);
  }

  async init() {
    try {
      // Создаем простые материалы без текстур
      this.createSimpleMaterials();
      
      // Объявляем массив промисов для загрузки моделей
      const modelLoadPromises = [
        // Используем пути от корня сервера ('/assets/...')
        this.loadUnitModel('pawn', 'white', '/assets/models/GEO_WhitePawn_08.gltf'),
        this.loadUnitModel('pawn', 'black', '/assets/models/GEO_BlackPawn_01.gltf'),
        this.loadUnitModel('rook', 'white', '/assets/models/GEO_WhiteRook_02.gltf'),
        this.loadUnitModel('rook', 'black', '/assets/models/GEO_BlackRook_01.gltf'),
        this.loadUnitModel('knight', 'white', '/assets/models/GEO_WhiteKnight_02.gltf'),
        this.loadUnitModel('knight', 'black', '/assets/models/GEO_BlackKnight_01.gltf'),
        this.loadUnitModel('bishop', 'white', '/assets/models/GEO_WhiteBishop_02.gltf'),
        this.loadUnitModel('bishop', 'black', '/assets/models/GEO_BlackBishop_01.gltf'),
        this.loadUnitModel('queen', 'white', '/assets/models/GEO_WhiteQueen.gltf'),
        this.loadUnitModel('queen', 'black', '/assets/models/GEO_BlackQueen.gltf'),
        this.loadUnitModel('king', 'white', '/assets/models/GEO_WhiteKing.gltf'),
        this.loadUnitModel('king', 'black', '/assets/models/GEO_BlackKing.gltf')
      ];
      
      // Загружаем все модели и обрабатываем ошибки
      const results = await Promise.allSettled(modelLoadPromises);
      
      // Проверяем результаты загрузки
      const failedModels = results.filter(result => result.status === 'rejected');
      if (failedModels.length > 0) {
        console.warn(`Не удалось загрузить ${failedModels.length} моделей:`, 
          failedModels.map(f => f.reason).join(', '));
      }
      
      console.log(`Успешно загружено ${results.length - failedModels.length} моделей из ${results.length}`);
      
      return true;
    } catch (error) {
      console.error("Ошибка при инициализации фабрики юнитов:", error);
      // Не выбрасываем ошибку, чтобы игра могла продолжаться даже с отсутствующими моделями
      return false;
    }
  }
  
  // Функция для создания простых материалов без текстур
  createSimpleMaterials() {
    this.whiteMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff, // Белый
      roughness: 0.5,  // Немного глянца
      metalness: 0.1   // Легкий металлический оттенок
    });

    this.blackMaterial = new THREE.MeshStandardMaterial({
      color: 0x000000, // Черный
      roughness: 0.5,  // Немного глянца
      metalness: 0.1   // Легкий металлический оттенок
    });
    console.log("Созданы простые материалы для фигур");
  }
  
  async loadUnitModel(type, color, path) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        path,
        (gltf) => {
          const model = gltf.scene;
          
          // Увеличиваем масштаб фигуры еще больше
          model.scale.set(160.0, 160.0, 160.0);
          
          // Убираем ручную корректировку Y, пусть модель позиционируется как есть
          /*
          let yOffset = 0;
          switch (type) {
            case 'pawn':
              yOffset = 2.0;
              break;
            case 'knight':
              yOffset = 3.0;
              break;
            case 'bishop':
              yOffset = 3.0;
              break;
            case 'rook':
              yOffset = 3.0;
              break;
            case 'queen':
              yOffset = 3.0;
              break;
            case 'king':
              yOffset = 4.0;
              break;
          }
          model.position.y = yOffset;
          */
          
          // Применяем материал в зависимости от цвета
          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.material = color === 'white' ? this.whiteMaterial.clone() : this.blackMaterial.clone();
            }
          });
          
          // Разворачиваем белые фигуры на 180 градусов
          if (color === 'white') {
            model.rotation.y = Math.PI; // Поворот на 180 градусов по оси Y
          }
          
          // Сохраняем модель
          const key = `${type}_${color}`;
          this.unitModels.set(key, model);
          resolve();
        },
        undefined,
        (error) => {
          console.error(`Ошибка при загрузке модели ${type} (${color}):`, error);
          reject(error);
        }
      );
    });
  }
  
  createUnit(type, ownerColor) {
    // Определяем цвет фигуры
    const color = ownerColor;
    
    // Получаем модель
    const modelKey = `${type}_${color}`;
    const originalModel = this.unitModels.get(modelKey);
    
    if (!originalModel) {
      console.error(`Модель ${modelKey} не найдена`);
      return null;
    }
    
    // Клонируем модель
    const modelClone = originalModel.clone();
    
    // Создаем основные характеристики фигуры в соответствии с PRD
    let unitStats = {
      hp: 0,
      maxHp: 0,
      mp: 0,
      maxMp: 0,
      baseDamage: 0,
      skills: []
    };
    
    // Задаем характеристики в зависимости от типа фигуры
    switch (type) {
      case 'pawn':
        unitStats.hp = unitStats.maxHp = 15;
        unitStats.mp = 0; // Начальное значение MP
        unitStats.maxMp = 20;
        unitStats.baseDamage = 10;
        unitStats.skills = [
          {
            name: 'Точный бросок',
            description: 'Дальняя атака на расстоянии 2 клеток',
            damage: 12,
            manaCost: 5,
            cooldown: 1,
            currentCooldown: 0,
            range: 2,
            targetType: 'enemy',
            effectType: 'damage'
          },
          {
            name: 'Боевой клич',
            description: 'Усиливает урон союзников на соседних клетках (+5 к следующей атаке)',
            damage: 0,
            manaCost: 10,
            cooldown: 2,
            currentCooldown: 0,
            range: 1,
            targetType: 'ally',
            effectType: 'buff',
            buffValue: 5,
            buffDuration: 2
          }
        ];
        break;
        
      case 'knight':
        unitStats.hp = unitStats.maxHp = 45;
        unitStats.mp = 0;
        unitStats.maxMp = 30;
        unitStats.baseDamage = 15;
        unitStats.skills = [
          {
            name: 'Кавалерийский бросок',
            description: 'Прыжковая атака (L-форма), оглушает цель',
            damage: 25,
            manaCost: 15,
            cooldown: 2,
            currentCooldown: 0,
            range: 0, // Особая форма движения
            targetType: 'enemy',
            effectType: 'damage+stun',
            stunDuration: 1
          },
          {
            name: 'Телохранитель',
            description: 'Перенаправляет урон от соседнего союзника на себя (-20% получаемого урона)',
            damage: 0,
            manaCost: 10,
            cooldown: 2,
            currentCooldown: 0,
            range: 1,
            targetType: 'ally',
            effectType: 'buff',
            damageReduction: 0.2,
            buffDuration: 2
          }
        ];
        break;
        
      case 'bishop':
        unitStats.hp = unitStats.maxHp = 40;
        unitStats.mp = 0;
        unitStats.maxMp = 40;
        unitStats.baseDamage = 15;
        unitStats.skills = [
          {
            name: 'Святое пламя',
            description: 'Магическая атака по диагонали (дальность 4)',
            damage: 20,
            manaCost: 10,
            cooldown: 1,
            currentCooldown: 0,
            range: 4,
            targetType: 'enemy',
            effectType: 'damage',
            attackPattern: 'diagonal'
          },
          {
            name: 'Исцеляющая молитва',
            description: 'Восстанавливает 20 HP и снимает дебаффы с союзника (или себя)',
            damage: -20, // Отрицательный урон = лечение
            manaCost: 20,
            cooldown: 2,
            currentCooldown: 0,
            range: 3,
            targetType: 'ally',
            effectType: 'heal+cleanse'
          }
        ];
        break;
        
      case 'rook':
        unitStats.hp = unitStats.maxHp = 60;
        unitStats.mp = 0;
        unitStats.maxMp = 30;
        unitStats.baseDamage = 20;
        unitStats.skills = [
          {
            name: 'Землетрясение',
            description: 'Линейная AOE атака (дальность 3), наносит урон всем юнитам на линии',
            damage: 20,
            manaCost: 15,
            cooldown: 3,
            currentCooldown: 0,
            range: 3,
            targetType: 'enemy',
            effectType: 'damage',
            attackPattern: 'line',
            aoe: true
          },
          {
            name: 'Щит бастиона',
            description: 'Создает барьер на 20 HP для соседнего союзника или себя',
            damage: 0,
            manaCost: 15,
            cooldown: 2,
            currentCooldown: 0,
            range: 1,
            targetType: 'ally',
            effectType: 'shield',
            shieldValue: 20,
            buffDuration: 2
          }
        ];
        break;
        
      case 'queen':
        unitStats.hp = unitStats.maxHp = 50;
        unitStats.mp = 0;
        unitStats.maxMp = 50;
        unitStats.baseDamage = 20;
        unitStats.skills = [
          {
            name: 'Огненный шар',
            description: 'Взрывная AOE атака (дальность 5), 25 урона цели, 10 урона окружающим 8 клеткам',
            damage: 25,
            manaCost: 20,
            cooldown: 3,
            currentCooldown: 0,
            range: 5,
            targetType: 'enemy',
            effectType: 'damage',
            aoe: true,
            aoeDamage: 10,
            aoeRange: 1
          },
          {
            name: 'Проклятие слабости',
            description: 'Цель теряет 10 урона и не восстанавливает ману в течение 2 ходов',
            damage: 0,
            manaCost: 15,
            cooldown: 3,
            currentCooldown: 0,
            range: 4,
            targetType: 'enemy',
            effectType: 'debuff',
            debuffDamage: 10,
            noManaRegen: true,
            debuffDuration: 2
          }
        ];
        break;
        
      case 'king':
        unitStats.hp = unitStats.maxHp = 70;
        unitStats.mp = 0;
        unitStats.maxMp = 40;
        unitStats.baseDamage = 15;
        unitStats.skills = [
          {
            name: 'Королевский гнев',
            description: 'Наносит урон всем врагам в радиусе 1 клетки',
            damage: 15,
            manaCost: 20,
            cooldown: 4,
            currentCooldown: 0,
            range: 0, // AOE вокруг себя, range должен быть 0
            targetType: 'enemy',
            effectType: 'damage',
            aoe: true,
            aoeRange: 1
          },
          {
            name: 'Королевское благословение',
            description: 'Исцеляет всех союзников на 10 HP и дает +5 MP',
            damage: -10, // Отрицательный урон = лечение
            manaCost: 30,
            cooldown: 5,
            currentCooldown: 0,
            range: 0, // Глобальное воздействие
            targetType: 'ally',
            effectType: 'heal+mana',
            manaBonus: 5,
            global: true
          }
        ];
        break;
    }
    
    // Создаем экземпляр Unit
    const unit = new Unit(
      type,
      modelClone,
      ownerColor,
      unitStats.hp,
      unitStats.maxHp,
      unitStats.mp,
      unitStats.maxMp,
      unitStats.baseDamage,
      unitStats.skills
    );
    
    return unit;
  }
} 