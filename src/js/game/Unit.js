import * as THREE from 'three';

export class Unit {
  constructor(type, model, ownerColor, hp, maxHp, mp, maxMp, baseDamage, skills, sceneManager) {
    this.type = type;
    this.model = model;
    this.ownerColor = ownerColor;
    this.hp = hp;
    this.maxHp = maxHp;
    this.mp = mp;
    this.maxMp = maxMp;
    this.baseDamage = baseDamage;
    this.skills = skills || [];
    this.sceneManager = sceneManager;
    
    this.position = { x: -1, z: -1 }; // Позиция на доске (-1, -1 означает не на доске)
    this.isSelected = false;
    this.selectionIndicator = null;
    
    // Статусы и эффекты
    this.effects = [];
    this.shield = 0;
    this.activeAnimations = []; // Массив для активных анимаций
    this.buffIndicator = null;  // Индикатор баффа (зеленое кольцо)
    this.debuffIndicator = null; // Индикатор дебаффа/стана (красное кольцо)
    
    // Хранилище для оригинальных материалов
    this.originalMaterials = new Map();
    // Хранилище для текущих активных материалов (клонов)
    this.activeMaterials = new Map();
    // Сохраняем оригинальные материалы при создании юнита
    this.saveMeshOriginalMaterials(model);
    
    // Создаем индикаторы HP и MP над фигурой
    this.createStatusIndicators();
    
    // Скрываем юнит по умолчанию, пока не будет помещен на доску
    this.model.visible = false;
  }
  
  createSelectionIndicator() {
    // Создаем геометрию кольца для индикатора выделения
    const innerRadius = 0.05; // Внутренний радиус кольца (8.0 / 160)
    const outerRadius = 0.0625; // Внешний радиус кольца (10.0 / 160)
    const segments = 32; // Количество сегментов
    
    const ringGeometry = new THREE.RingGeometry(innerRadius, outerRadius, segments);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00, // Временно ставим желтый для всех
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0 // Начальная непрозрачность - полностью прозрачно
    });
    
    this.selectionIndicator = new THREE.Mesh(ringGeometry, ringMaterial);
    this.selectionIndicator.rotation.x = -Math.PI / 2; // Поворачиваем горизонтально
    this.selectionIndicator.position.y = 0.002; // Поднимаем над землей (0.2 / 100) - немного больше для видимости
    
    this.model.add(this.selectionIndicator);
  }
  
  createStatusIndicators() {
    // Создаем контейнер для индикаторов здоровья и маны
    this.statusContainer = new THREE.Group();
    this.model.add(this.statusContainer);
    
    // Позиционируем контейнер над фигурой
    this.statusContainer.position.y = 0.1; // Поднимаем выше для лучшей видимости (15.0 / 150) - подбираем значение
    
    // Добавляем отображение имени фигуры
    this.createUnitNameLabel();
    
    // Размеры полосок (для спрайтов размеры canvas будут определять соотношение, а scale - итоговый размер)
    const barWidth = 0.05; // Используем как целевую ширину при масштабировании
    const barHeight = 0.0075; // Используем как целевую высоту при масштабировании
    // Разделяем Z для HP и MP, чтобы избежать перекрытия при взгляде сверху
    const mpBackgroundZ = 0.001;
    const mpFillZ = 0.002;
    const mpTextZ = 0.003;
    const hpBackgroundZ = 0.004; // HP рендерится "выше" MP
    const hpFillZ = 0.005;
    const hpTextZ = 0.006;

    // --- Используем перерисовку Canvas для полосок ---

    // Создаем спрайт для HP бара
    const hpRatio = this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
    this.hpBarSprite = this.createBarCanvasSprite(barWidth, barHeight, '#333333', '#ff0000', hpRatio);
    this.hpBarSprite.position.set(0, barHeight * 1.5, hpFillZ); // Используем Z заполнения как основной
    // Центр и позиция X по умолчанию (0.5, 0.5 и 0)
    this.hpBarSprite.renderOrder = 5; // Ставим выше фона, если бы он был отдельным

    // Добавляем текст HP
    this.hpText = this.createTextSprite(`${this.hp}/${this.maxHp}`, "#ffffff", 0.005);
    this.hpText.position.set(0, barHeight * 1.5, hpTextZ);
    this.hpText.renderOrder = 6; // Текст HP

    // Создаем спрайт для MP бара
    const mpRatio = this.maxMp > 0 ? Math.max(0, this.mp / this.maxMp) : 0;
    this.mpBarSprite = this.createBarCanvasSprite(barWidth, barHeight, '#333333', '#0066ff', mpRatio);
    this.mpBarSprite.position.set(0, 0, mpFillZ); // Используем Z заполнения как основной
    // Центр и позиция X по умолчанию (0.5, 0.5 и 0)
    this.mpBarSprite.renderOrder = 2; // Ставим выше фона, если бы он был отдельным

    // Добавляем текст MP
    this.mpText = this.createTextSprite(`${this.mp}/${this.maxMp}`, "#ffffff", 0.005);
    this.mpText.position.set(0, 0, mpTextZ);
    this.mpText.renderOrder = 3; // Текст MP

    // Добавляем индикаторы в контейнер
    this.statusContainer.add(this.hpBarSprite);
    this.statusContainer.add(this.mpBarSprite);
    this.statusContainer.add(this.hpText);
    this.statusContainer.add(this.mpText);
    
    // Если у фигуры есть щит, добавляем индикатор щита
    if (this.shield > 0) {
      this.createShieldIndicator();
    }
    
    // Поворачиваем индикаторы лицом к камере
    // Не устанавливаем фиксированный поворот, будем обновлять в каждом кадре
    
    // Делаем видимыми
    this.statusContainer.visible = true;
  }
  
  createUnitNameLabel() {
    // Определяем название фигуры и создаем текстовый спрайт
    let unitName = "";
    switch (this.type) {
      case 'king': unitName = "Король"; break;
      case 'queen': unitName = "Ферзь"; break;
      case 'bishop': unitName = "Слон"; break;
      case 'knight': unitName = "Конь"; break;
      case 'rook': unitName = "Ладья"; break;
      case 'pawn': unitName = "Пешка"; break;
      default: unitName = this.type;
    }
    
    // Создаем текстовый спрайт с названием фигуры
    const nameLabel = this.createTextSprite(unitName, "#ffffff", 0.007); // Временно белый для всех
    nameLabel.position.set(0, 0.03, 0); // Позиционируем выше полосок (3.0 / 100)
    this.statusContainer.add(nameLabel);
  }
  
  createTextSprite(text, color, size = 1) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    // Уменьшаем размер canvas и шрифта для лучшей четкости при малом масштабе спрайта
    canvas.width = 128; 
    canvas.height = 32;
    
    context.font = "Bold 16px Arial"; // Уменьшаем шрифт
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false, // Отключаем тест глубины для спрайтов, чтобы они всегда были видны
      depthWrite: false
    });
    
    const sprite = new THREE.Sprite(material);
     // Масштаб подбираем экспериментально, size теперь влияет на относительный размер
    sprite.scale.set(size * canvas.width / 1000, size * canvas.height / 1000, 1); // Уменьшаем базовый масштаб спрайта
    
    return sprite;
  }
  
  createShieldIndicator() {
    // Создаем индикатор щита (голубая окантовка)
    const shieldGeometry = new THREE.RingGeometry(0.05, 0.06, 32); // Уменьшаем радиусы
    const shieldMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7 // Сразу устанавливаем видимую прозрачность
    });
    
    this.shieldIndicator = new THREE.Mesh(shieldGeometry, shieldMaterial);
    // Позиционируем низко, у основания фигуры
    this.shieldIndicator.position.set(0, 0.01, 0); // Поднимаем чуть выше
    // Поворачиваем горизонтально
    this.shieldIndicator.rotation.x = -Math.PI / 2; // Правильный поворот
    this.shieldIndicator.visible = true; // Делаем сразу видимым
    
    // Добавляем индикатор к основной модели, а не к statusContainer
    this.model.add(this.shieldIndicator);
    
    return this.shieldIndicator; // Возвращаем созданный индикатор
    
    // Текст щита будет создан/обновлен в updateStatusIndicators и добавлен в statusContainer
  }
  
  createBuffIndicator() {
    // Аналогично shieldIndicator, но зеленый
    const geometry = new THREE.RingGeometry(0.05, 0.06, 32); // Уменьшаем радиусы
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00, // Зеленый
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7, // Сразу устанавливаем видимое значение вместо анимации
      depthTest: false, // Добавляем
      depthWrite: false // Добавляем
    });
    this.buffIndicator = new THREE.Mesh(geometry, material);
    this.buffIndicator.position.set(0, 0.01, 0);
    this.buffIndicator.rotation.x = -Math.PI / 2;
    this.buffIndicator.visible = true; // Делаем сразу видимым
    console.log("Создаю индикатор баффа:", this.buffIndicator);
    this.model.add(this.buffIndicator);
    console.log("Индикатор баффа добавлен к модели:", this.model);
    return this.buffIndicator; // Возвращаем созданный индикатор
  }

  createDebuffIndicator() {
    // Аналогично shieldIndicator, но красный
    const geometry = new THREE.RingGeometry(0.05, 0.06, 32); // Уменьшаем радиусы
    const material = new THREE.MeshBasicMaterial({
      color: 0xff0000, // Красный
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7, // Сразу устанавливаем видимое значение вместо анимации
      depthTest: false, // Добавляем
      depthWrite: false // Добавляем
    });
    this.debuffIndicator = new THREE.Mesh(geometry, material);
    this.debuffIndicator.position.set(0, 0.01, 0);
    this.debuffIndicator.rotation.x = -Math.PI / 2;
    this.debuffIndicator.visible = true; // Делаем сразу видимым
    if (this.DEBUG_ANIMATIONS) console.log("Создаю индикатор дебаффа:", this.debuffIndicator);
    this.model.add(this.debuffIndicator);
    if (this.DEBUG_ANIMATIONS) console.log("Индикатор дебаффа добавлен к модели:", this.model);
    return this.debuffIndicator; // Возвращаем созданный индикатор
  }

  updateStatusIndicators() {
    // Проверяем, существует ли контейнер
    if (!this.statusContainer) return;
    
    const barWidth = 0.05; // Используем тот же размер
    const barHeight = 0.0075;
    // Используем новые Z-координаты
    const mpTextZ = 0.003;
    const hpTextZ = 0.006;

    // Обновляем индикатор HP (Sprite)
    // --- Перерисовываем Canvas для HP бара ---
    if (this.hpBarSprite && this.hpBarSprite.material.map) {
      const map = this.hpBarSprite.material.map;
      const canvas = map.image;
      const context = canvas.getContext('2d');
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const fillColor = '#ff0000'; // TODO: Передавать или хранить цвета
      const bgColor = '#333333';

      // Очистка
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      // Рисуем фон
      context.fillStyle = bgColor;
      context.fillRect(0, 0, canvasWidth, canvasHeight);
      // Рисуем заполнение
      const hpUpdateRatio = this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
      const fillWidth = canvasWidth * hpUpdateRatio;
      context.fillStyle = fillColor;
      context.fillRect(0, 0, fillWidth, canvasHeight);
      // Обновляем текстуру
      map.needsUpdate = true;
    }
    // --- Конец перерисовки HP бара ---

    // Обновляем текст HP
    if (this.hpText) {
      this.hpText.material.map.dispose(); // Освобождаем старую текстуру
      this.statusContainer.remove(this.hpText);
    }
    this.hpText = this.createTextSprite(`${this.hp}/${this.maxHp}`, "#ffffff", 0.005);
    this.hpText.position.set(0, barHeight * 1.5, hpTextZ);
    this.hpText.renderOrder = 6; // Устанавливаем renderOrder заново
    this.statusContainer.add(this.hpText);

    // Обновляем индикатор MP (Sprite)
    // --- Перерисовываем Canvas для MP бара ---
    if (this.mpBarSprite && this.mpBarSprite.material.map) {
      const map = this.mpBarSprite.material.map;
      const canvas = map.image;
      const context = canvas.getContext('2d');
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const fillColor = '#0066ff'; // TODO: Передавать или хранить цвета
      const bgColor = '#333333';

      // Очистка
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      // Рисуем фон
      context.fillStyle = bgColor;
      context.fillRect(0, 0, canvasWidth, canvasHeight);
      // Рисуем заполнение
      const mpUpdateRatio = this.maxMp > 0 ? Math.max(0, this.mp / this.maxMp) : 0;
      const fillWidth = canvasWidth * mpUpdateRatio;
      context.fillStyle = fillColor;
      context.fillRect(0, 0, fillWidth, canvasHeight);
      // Обновляем текстуру
      map.needsUpdate = true;
    }
    // --- Конец перерисовки MP бара ---

    // Обновляем текст MP
    if (this.mpText) {
      this.mpText.material.map.dispose(); // Освобождаем старую текстуру
      this.statusContainer.remove(this.mpText);
    }
    this.mpText = this.createTextSprite(`${this.mp}/${this.maxMp}`, "#ffffff", 0.005);
    this.mpText.position.set(0, 0, mpTextZ);
    this.mpText.renderOrder = 3; // Устанавливаем renderOrder заново
    this.statusContainer.add(this.mpText);

    // Обновляем щит, если он есть
    if (this.shield > 0) {
      // Создаем индикатор, если его еще нет
      if (!this.shieldIndicator) {
        this.createShieldIndicator(); 
      }
      // Запускаем анимацию появления, если индикатор не виден или почти прозрачен
      if (this.shieldIndicator && (!this.shieldIndicator.visible || this.shieldIndicator.material.opacity < 0.1)) {
           this.playEffectAnimation('shield');
      }
    } else {
      // Если щита нет, запускаем анимацию исчезновения (если индикатор еще виден)
      if (this.shieldIndicator && this.shieldIndicator.visible && this.shieldIndicator.material.opacity > 0) {
         // Удаляем существующие анимации прозрачности щита
         this.activeAnimations = this.activeAnimations.filter(anim => 
            !(anim.target === this.shieldIndicator.material && anim.property === 'opacity')
         );
         // Добавляем анимацию исчезновения
         this.activeAnimations.push({
           id: 'shield_fade_out', // Идентификатор
           target: this.shieldIndicator.material, 
           property: 'opacity',
           startValue: this.shieldIndicator.material.opacity, // Начинаем с текущей
           endValue: 0, 
           startTime: Date.now(), 
           duration: 300 // Быстрое исчезновение (0.3 сек)
        });
        // Не делаем visible = false сразу, анимация сама скроет в конце
      }
    }
    
    // Обновляем индикаторы эффектов, если они есть
    this.updateEffectsIndicators();
    
    // Убеждаемся, что индикаторы видимы
    this.statusContainer.visible = true;
  }
  
  updateEffectsIndicators() {
    // Удаляем предыдущие индикаторы эффектов, если они были
    if (this.effectsIndicators) {
      this.effectsIndicators.forEach(indicator => {
        this.statusContainer.remove(indicator);
      });
    }
    
    this.effectsIndicators = [];
    
    // Если нет эффектов, выходим и скрываем все индикаторы
    if (!this.effects || this.effects.length === 0) {
      // Скрываем индикаторы эффектов, если эффектов нет
      if (this.buffIndicator) {
        this.buffIndicator.visible = false;
      }
      if (this.debuffIndicator) {
        this.debuffIndicator.visible = false;
      }
      if (this.shieldIndicator) {
        this.shieldIndicator.visible = false;
      }
      return;
    }
    
    // Проверяем, есть ли баффы среди эффектов
    const hasBuffs = this.effects.some(effect => effect.type === 'buff' || effect.type === 'protected');
    const hasDebuffs = this.effects.some(effect => effect.type === 'debuff' || effect.type === 'stun');
    const hasShield = this.effects.some(effect => effect.type === 'shield');
    
    // Если баффов нет, скрываем индикатор баффа
    if (this.buffIndicator) {
      this.buffIndicator.visible = hasBuffs;
    }
    // Если дебаффов нет, скрываем индикатор дебаффа
    if (this.debuffIndicator) {
      this.debuffIndicator.visible = hasDebuffs;
    }
    // Если щита нет, скрываем индикатор щита
    if (this.shieldIndicator) {
      this.shieldIndicator.visible = hasShield;
    }
  }
  
  select() {
    // Выделяем юнит
    this.isSelected = true;
    // Делаем индикатор видимым, ТОЛЬКО ЕСЛИ ОН СУЩЕСТВУЕТ
    if (this.selectionIndicator) {
      this.selectionIndicator.material.opacity = 0.8; 
    }
    
    // Добавляем logging для проверки
    console.log(`Фигура ${this.type} на позиции (${this.position.x},${this.position.z}) выбрана`);
  }
  
  deselect() {
    // Снимаем выделение
    this.isSelected = false;
    // Скрываем индикатор, ТОЛЬКО ЕСЛИ ОН СУЩЕСТВУЕТ
    if (this.selectionIndicator) {
      this.selectionIndicator.material.opacity = 0.0; 
    }
  }
  
  placeOnBoard(x, z, boardRef) {
    this.position.x = x;
    this.position.z = z;
    
    // Получаем мировые координаты для позиции на шахматной доске
    const worldX = boardRef.getWorldX(x);
    const worldZ = boardRef.getWorldZ(z);
    
    console.log(`Размещение ${this.type} на доске в позиции (${x},${z}), мировые координаты (${worldX},${worldZ})`);
    
    // Устанавливаем позицию модели. 
    // Y координата модели должна быть 0 относительно группы доски (boardGroup),
    // которая сама сдвинута на boardGroup.position.y
    this.model.position.set(worldX, 0, worldZ); 
    
    // Делаем модель видимой
    this.model.visible = true;
    
    // Делаем контейнер статусов видимым и обновляем индикаторы
    if (this.statusContainer) {
      this.statusContainer.visible = true;
    }
    
    // Обновляем индикаторы здоровья и маны
    this.updateStatusIndicators();
  }
  
  takeDamage(amount) {
    // ЛОГ для отладки: Показываем текущие эффекты юнита
    console.log(`takeDamage вызван для ${this.type}. Текущие эффекты:`, JSON.stringify(this.effects.map(e => ({type: e.type, duration: e.duration, protector: e.protector?.type}))));

    // Проверяем эффект 'protected' (Телохранитель)
    const protectEffect = this.effects.find(effect => effect.type === 'protected');
    if (protectEffect && protectEffect.protector && protectEffect.protector.hp > 0) {
      const protector = protectEffect.protector;
      const reduction = protectEffect.reduction || 0;
      const redirectedDamage = Math.max(1, Math.floor(amount * (1 - reduction))); // Урон с учетом снижения, минимум 1
      
      console.log(`Урон ${amount} перенаправлен от ${this.type} к ${protector.type} (получит ${redirectedDamage})`);
      
      // Наносим урон защитнику
      const isProtectorKilled = protector.takeDamage(redirectedDamage);
      
      // Если защитник погиб, эффект защиты спадает (удаляем его)
      if (isProtectorKilled) {
        this.effects = this.effects.filter(effect => effect !== protectEffect);
      }
      
      // Возвращаем false, так как сама цель урон не получила
      return false;
    }

    // Если нет перенаправления, продолжаем стандартную логику
    let remainingAmount = amount;
    
    // Проверяем наличие щита
    if (this.shield > 0) {
      // Щит поглощает часть урона
      if (this.shield >= remainingAmount) {
        this.shield -= remainingAmount;
        remainingAmount = 0;
      } else {
        remainingAmount -= this.shield;
        this.shield = 0;
      }
    }
    
    // Применяем оставшийся урон к здоровью
    if (remainingAmount > 0) {
      this.hp = Math.max(0, this.hp - remainingAmount);
    }
    
    // Обновляем индикатор здоровья
    this.updateStatusIndicators();
    
    return this.hp <= 0; // Возвращаем true, если юнит погиб
  }
  
  heal(amount) {
    // Восстанавливаем здоровье, но не больше максимума
    this.hp = Math.min(this.maxHp, this.hp + amount);
    
    // Обновляем индикатор здоровья
    this.updateStatusIndicators();
  }
  
  useMana(amount) {
    // Проверяем, достаточно ли маны
    if (this.mp < amount) {
      return false;
    }
    
    // Уменьшаем ману
    this.mp -= amount;
    
    // Обновляем индикатор маны
    this.updateStatusIndicators();
    
    return true;
  }
  
  restoreMana(amount) {
    // Восстанавливаем ману, но не больше максимума
    this.mp = Math.min(this.maxMp, this.mp + amount);
    
    // Обновляем индикатор маны
    this.updateStatusIndicators();
  }
  
  addEffect(effect) {
    // Проверяем, что массив эффектов инициализирован
    if (!this.effects) {
        this.effects = [];
    }
    console.log(`Добавлен эффект ${effect.type} с длительностью ${effect.duration} к ${this.type}`);
    this.effects.push(effect);
    // Обновляем визуальные индикаторы
    this.updateStatusIndicators();
  }
  
  removeExpiredEffects() {
    // --- DEBUG START ---
    console.log(`[removeExpiredEffects] Вызвано для: ${this.type} (${this.ownerColor})`);
    if (this.effects && this.effects.length > 0) {
      console.log(`  -> ДО:`, JSON.stringify(this.effects.map(e => ({ type: e.type, duration: e.duration }))));
    } else {
      console.log(`  -> Эффектов нет.`);
      return; // Выходим, если эффектов нет
    }
    // --- DEBUG END ---
    
    // Удаляем все эффекты с истекшим сроком действия
    const removedEffects = [];
    this.effects = this.effects.filter(effect => {
      // --- DEBUG START ---
      const oldDuration = effect.duration;
      effect.duration--;
      // console.log(`    -- Декремент эффекта ${effect.type}: ${oldDuration} -> ${effect.duration}`); // Можно раскомментировать для еще большей детализации
      // --- DEBUG END ---
      if (effect.duration <= 0) {
         removedEffects.push(effect.type);
         console.log(`    -- Эффект ${effect.type} истек и будет удален.`); // Лог удаления
         return false; // Удаляем эффект
      }
      return true; // Оставляем эффект
    });
    
    // --- DEBUG START ---
    if (this.effects && this.effects.length > 0) {
      console.log(`  -> ПОСЛЕ:`, JSON.stringify(this.effects.map(e => ({ type: e.type, duration: e.duration }))));
    } else {
       console.log(`  -> ПОСЛЕ: Эффектов не осталось.`);
    }
    if (removedEffects.length > 0) {
        console.log(`  -> Удаленные типы эффектов:`, removedEffects.join(', '));
    }
    // --- DEBUG END ---

    // Если был удален эффект щита, обнуляем щит и запускаем анимацию исчезновения
    if (removedEffects.includes('shield') && !this.effects.some(e => e.type === 'shield')) {
      console.log(`Эффект щита истек для ${this.type}, обнуляем щит.`);
      this.shield = 0;
      // Запускаем анимацию исчезновения кольца щита
      if (this.shieldIndicator) {
         this.activeAnimations = this.activeAnimations.filter(anim => 
             !(anim.target === this.shieldIndicator.material && anim.property === 'opacity')
         );
         this.activeAnimations.push({
            id: 'shield_fade_out', // Добавляем ID
            target: this.shieldIndicator.material, 
            property: 'opacity',
            startValue: this.shieldIndicator.material.opacity,
            endValue: 0, 
            startTime: Date.now(), 
            duration: 300 // Такая же длительность, как у других колец
         });
      }
      this.updateStatusIndicators(); 
    }
    
    // Если был удален эффект баффа, просто позволяем updateStatusIndicators скрыть его
    const buffRemoved = removedEffects.includes('buff') && !this.effects.some(e => e.type === 'buff');
    if (buffRemoved) {
        console.log(`Эффект баффа истек для ${this.type}, будет скрыт через updateStatusIndicators.`);
    }

    // Если был удален эффект дебаффа или стана, просто позволяем updateStatusIndicators скрыть его
    const debuffOrStunRemoved = (removedEffects.includes('debuff') && !this.effects.some(e => e.type === 'debuff')) || 
                              (removedEffects.includes('stun') && !this.effects.some(e => e.type === 'stun'));
    if (debuffOrStunRemoved) {
        console.log(`Эффект дебаффа/стана истек для ${this.type}, будет скрыт через updateStatusIndicators.`);
    }
    
    // Если были удалены какие-либо эффекты, обновляем индикаторы (это скроет ненужные кольца)
    if (removedEffects.length > 0) {
        this.updateStatusIndicators();
    }
  }
  
  addShield(amount) {
    // Добавляем щит
    this.shield += amount;
  }
  
  // Хелперная функция для создания анимации вспышки
  applyFlashAnimation(color, durationOn = 150, durationOff = 300) {
    if (!this.model) return;
    
    // console.log(`Применяю анимацию вспышки с цветом ${color} к ${this.type}`);
    
    const now = performance.now();
    const flashId = `flash_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Удаляем все существующие анимации вспышки
    this.activeAnimations = this.activeAnimations.filter(anim => 
        !(anim.property === 'emissive' && (anim.id.startsWith('flash_on_') || anim.id.startsWith('flash_off_')))
    );
    
    // Подготавливаем цвет эмиссии для анимации
    const flashColor = new THREE.Color(color);
    
    // Проходим по всем объектам модели, чтобы найти все меши
    this.model.traverse(child => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach((currentMaterial, index) => {
          // Работаем только с основными типами материалов
          if (!currentMaterial.isMeshStandardMaterial && !currentMaterial.isMeshBasicMaterial) return;
          
          // Получаем ключ для материала
          const matKey = Array.isArray(child.material) ? `${child.uuid}_${index}` : child.uuid;
          
          // Получаем оригинальный материал
          const origMat = this.getOriginalMaterial(child.uuid, Array.isArray(child.material) ? index : null);
          if (!origMat) {
            console.warn(`Не найден оригинальный материал для ${child.uuid}`);
            return;
          }
          
          // Создаем новый клон из оригинального материала
          const newClonedMaterial = origMat.clone();
          
          // Сохраняем клон в активные материалы
          this.activeMaterials.set(matKey, newClonedMaterial);
          
          // Сохраняем оригинальный emissive цвет
          const originalEmissive = origMat.emissive ? origMat.emissive.clone() : new THREE.Color(0x000000);
          
          // Устанавливаем исходный цвет для клона
          if (newClonedMaterial.emissive) {
            newClonedMaterial.emissive.copy(originalEmissive);
          } else {
            newClonedMaterial.emissive = new THREE.Color(0x000000);
          }
          
          newClonedMaterial.needsUpdate = true;
          
          // Уникальные ID для анимаций этого материала
          const animIdOn = `flash_on_${flashId}_${matKey}`;
          const animIdOff = `flash_off_${flashId}_${matKey}`;
          
          // Анимация включения вспышки
          this.activeAnimations.push({
            id: animIdOn,
            target: newClonedMaterial,
            property: 'emissive',
            startValue: originalEmissive.clone(),
            endValue: flashColor.clone(),
            startTime: now,
            duration: durationOn,
            onComplete: null
          });
          
          // Анимация выключения вспышки (возврат к исходному цвету)
          this.activeAnimations.push({
            id: animIdOff,
            target: newClonedMaterial,
            property: 'emissive',
            startValue: flashColor.clone(),
            endValue: originalEmissive.clone(),
            startTime: now + durationOn, // Начинается после завершения вспышки
            duration: durationOff,
            onComplete: () => {
              // Восстанавливаем оригинальный материал после анимации
              if (Array.isArray(child.material)) {
                child.material[index] = origMat.clone();
              } else {
                child.material = origMat.clone();
              }
            }
          });
          
          // Применяем клонированный материал к мешу
          if (Array.isArray(child.material)) {
            child.material[index] = newClonedMaterial;
          } else {
            child.material = newClonedMaterial;
          }
        });
      }
    });
  }

  getPossibleMoves(boardRef) {
    // Если юнит оглушен, он не может двигаться
    if (this.isStunned && typeof this.isStunned === 'function' && this.isStunned()) {
      console.warn(`Фигура ${this.type} оглушена и не может двигаться`);
      return [];
    }
    
    const moves = [];
    const { x, z } = this.position;
    const boardSize = boardRef.size;

    // Упрощаем получение юнитов напрямую из данных доски
    const getUnitAt = (checkX, checkZ) => {
      if (checkX < 0 || checkX >= boardSize || checkZ < 0 || checkZ >= boardSize) {
        return undefined; // Позиция вне доски
      }
      
      // Исправляем доступ к данным доски
      const index = checkX * boardSize + checkZ;
      if (index >= 0 && index < boardRef.squareData.length) {
        return boardRef.squareData[index].unit;
      }
      
      return null; // Если нет данных, считаем клетку пустой
    };
   
    switch (this.type) {
      case 'pawn':
        // Исправляем направление: Белые (игрок) идут +1 по Z, Черные -1 по Z
        const direction = this.ownerColor === 'white' ? 1 : -1; 
        const forwardZ = z + direction;

        // Ход вперед на 1 клетку (проверяем явно на null)
        if (forwardZ >= 0 && forwardZ < boardSize && getUnitAt(x, forwardZ) === null) {
          moves.push({ x: x, z: forwardZ });
        }

        // Первый ход на 2 клетки
        // Исправляем стартовый ряд: Белые с z=1, Черные с z=6
        const startRow = this.ownerColor === 'white' ? 1 : boardSize - 2; 
        // Проверяем явно на null
        if (z === startRow && getUnitAt(x, forwardZ) === null && getUnitAt(x, forwardZ + direction) === null) {
          moves.push({ x: x, z: forwardZ + direction });
        }

        // Атака по диагонали
        for (const dx of [-1, 1]) {
          const attackX = x + dx;
          const targetUnit = getUnitAt(attackX, forwardZ);
          if (targetUnit && targetUnit.ownerColor !== this.ownerColor) {
            moves.push({ x: attackX, z: forwardZ });
          }
        }
        // TODO: Добавить взятие на проходе (En passant), если нужно
        break;

      case 'rook':
        const rookDirections = [{dx: 0, dz: 1}, {dx: 0, dz: -1}, {dx: 1, dz: 0}, {dx: -1, dz: 0}];
        for (const dir of rookDirections) {
          for (let i = 1; i < boardSize; i++) {
            const checkX = x + i * dir.dx;
            const checkZ = z + i * dir.dz;
            const targetUnit = getUnitAt(checkX, checkZ);
            if (targetUnit === undefined) break; // Вышли за пределы доски
            // Исправляем проверку на пустую клетку
            if (targetUnit === null) { 
              moves.push({ x: checkX, z: checkZ });
            } else { // Наткнулись на фигуру
              if (targetUnit.ownerColor !== this.ownerColor) { // Враг
                moves.push({ x: checkX, z: checkZ });
              }
              break; // Дальше идти нельзя
            }
          }
        }
        break;

      case 'knight':
        const knightMoves = [
          {dx: 1, dz: 2}, {dx: 1, dz: -2}, {dx: -1, dz: 2}, {dx: -1, dz: -2},
          {dx: 2, dz: 1}, {dx: 2, dz: -1}, {dx: -2, dz: 1}, {dx: -2, dz: -1}
        ];
        for (const move of knightMoves) {
          const checkX = x + move.dx;
          const checkZ = z + move.dz;
          const targetUnit = getUnitAt(checkX, checkZ);
          // Проверка коня не требует явного === null, т.к. он просто перепрыгивает
          if (targetUnit !== undefined && (targetUnit === null || targetUnit.ownerColor !== this.ownerColor)) {
             moves.push({ x: checkX, z: checkZ });
          }
        }
        break;

      case 'bishop':
        const bishopDirections = [{dx: 1, dz: 1}, {dx: 1, dz: -1}, {dx: -1, dz: 1}, {dx: -1, dz: -1}];
        for (const dir of bishopDirections) {
          for (let i = 1; i < boardSize; i++) {
            const checkX = x + i * dir.dx;
            const checkZ = z + i * dir.dz;
            const targetUnit = getUnitAt(checkX, checkZ);
            if (targetUnit === undefined) break; 
            // Исправляем проверку на пустую клетку
            if (targetUnit === null) {
              moves.push({ x: checkX, z: checkZ });
            } else {
              if (targetUnit.ownerColor !== this.ownerColor) {
                moves.push({ x: checkX, z: checkZ });
              }
              break;
            }
          }
        }
        break;

      case 'queen':
        const queenDirections = [
          {dx: 0, dz: 1}, {dx: 0, dz: -1}, {dx: 1, dz: 0}, {dx: -1, dz: 0},
          {dx: 1, dz: 1}, {dx: 1, dz: -1}, {dx: -1, dz: 1}, {dx: -1, dz: -1}
        ];
        for (const dir of queenDirections) {
          for (let i = 1; i < boardSize; i++) {
            const checkX = x + i * dir.dx;
            const checkZ = z + i * dir.dz;
            const targetUnit = getUnitAt(checkX, checkZ);
            if (targetUnit === undefined) break; 
            // Исправляем проверку на пустую клетку
            if (targetUnit === null) {
              moves.push({ x: checkX, z: checkZ });
            } else {
              if (targetUnit.ownerColor !== this.ownerColor) {
                moves.push({ x: checkX, z: checkZ });
              }
              break;
            }
          }
        }
        break;

      case 'king':
        const kingMoves = [
          {dx: 0, dz: 1}, {dx: 0, dz: -1}, {dx: 1, dz: 0}, {dx: -1, dz: 0},
          {dx: 1, dz: 1}, {dx: 1, dz: -1}, {dx: -1, dz: 1}, {dx: -1, dz: -1}
        ];
        for (const move of kingMoves) {
           const checkX = x + move.dx;
           const checkZ = z + move.dz;
           const targetUnit = getUnitAt(checkX, checkZ);
           // Король не может идти под атаку - TODO: добавить проверку атаки на клетку
           if (targetUnit !== undefined && (targetUnit === null || targetUnit.ownerColor !== this.ownerColor)) {
              moves.push({ x: checkX, z: checkZ });
           }
        }
        // TODO: Добавить рокировку (Castling)
        break;
    }
    return moves;
  }
  
  getValidSkillTargets(skill, boardRef) { 
    // Если юнит оглушен, он не может использовать навыки
    if (this.isStunned && typeof this.isStunned === 'function' && this.isStunned()) {
      console.warn(`Фигура ${this.type} оглушена и не может использовать навыки`);
      return [];
    }
    
    // ... (Логика определения целей для навыка, должна использовать getUnitAt или boardRef.squareData) ...
    // Пример (нужно адаптировать под ваши скиллы):
    const targets = [];
    const boardSize = boardRef.size;
    const getUnitAt = (checkX, checkZ) => { /* ... как в getPossibleMoves ... */ };

    if(skill.targetType === 'enemy' || skill.targetType === 'ally'){
       for (let checkX = 0; checkX < boardSize; checkX++) {
         for (let checkZ = 0; checkZ < boardSize; checkZ++) {
            const distance = Math.max(Math.abs(checkX - this.position.x), Math.abs(checkZ - this.position.z));
            if(distance <= skill.range){
               const targetUnit = getUnitAt(checkX, checkZ);
               if (skill.targetType === 'enemy' && targetUnit && targetUnit.ownerColor !== this.ownerColor) {
                  targets.push({ x: checkX, z: checkZ });
               } else if (skill.targetType === 'ally' && targetUnit && targetUnit.ownerColor === this.ownerColor) {
                  targets.push({ x: checkX, z: checkZ });
               } else if (skill.targetType === 'empty' && !targetUnit) {
                  // Если навык можно применить на пустую клетку
                  targets.push({ x: checkX, z: checkZ });
               }
            }
         }
       }
    }
    // ... (дополнительная логика для особых зон действия) ...
    return targets;
  }
  
  // Добавим новый метод для обновления ориентации индикаторов
  updateIndicatorsOrientation(camera) {
    // Проверяем, есть ли контейнер статусов и камера
    if (this.statusContainer && camera) {
      // --- Вариант с поворотом ВСЕГО контейнера к камере ---
      // Копируем кватернион камеры в кватернион контейнера статусов.
      // Это заставит весь контейнер (включая полоски и текст) смотреть на камеру.
      this.statusContainer.quaternion.copy(camera.quaternion);
    }
  }

  // Добавляем метод для проверки состояния оглушения
  isStunned() {
    // Проверяем, оглушен ли юнит (наличие эффекта типа stun)
    if (!this.effects || !Array.isArray(this.effects)) {
      return false;
    }
    return this.effects.some(effect => effect.type === 'stun');
  }

  // --- НОВЫЙ МЕТОД: Создает спрайт с Canvas, рисует фон и начальное заполнение ---
  createBarCanvasSprite(targetWidth, targetHeight, bgColor, fillColor, initialRatio) {
    const canvas = document.createElement('canvas');
    // Делаем canvas чуть больше, чтобы избежать артефактов по краям при масштабировании
    const canvasWidth = 64; // Фиксированная ширина для текстуры
    const canvasHeight = 8; // Фиксированная высота для текстуры
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext('2d');

    // Рисуем фон
    context.fillStyle = bgColor; // Используем CSS цвет напрямую
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    // Рисуем начальное заполнение
    const initialFillWidth = canvasWidth * initialRatio;
    context.fillStyle = fillColor;
    context.fillRect(0, 0, initialFillWidth, canvasHeight);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true, // Может быть полупрозрачность в цветах
      opacity: 1.0,      // Управляем через цвета
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true // Масштаб зависит от расстояния
    });

    const sprite = new THREE.Sprite(material);
    // Устанавливаем итоговый размер спрайта
    sprite.scale.set(targetWidth, targetHeight, 1);

    return sprite;
  }
  // --- КОНЕЦ НОВОГО МЕТОДА ---

  // Метод для обновления активных анимаций
  updateAnimations(deltaTime) {
    if (!this.activeAnimations.length) return;
    
    const now = performance.now();
    let animationsToRemove = [];
    
    // Перебираем все активные анимации
    this.activeAnimations.forEach((anim, i) => {
      // Проверяем анимации баффа для отладки
      if (anim.id && (anim.id === 'buff_fade_in' || anim.id === 'buff_fade_out')) {
        console.log(`Обновление анимации ${anim.id}, target существует: ${!!anim.target}, property: ${anim.property}, currentOpacity: ${anim.target ? anim.target.opacity : 'нет target'}`);
      }
      
      const elapsedTime = now - anim.startTime;
      // Ограничиваем progress диапазоном [0, 1]
      const progress = Math.max(0, Math.min(1, elapsedTime / anim.duration));
      
      // Интерполяция значения
      let currentValue;
      
      // Если это цвет (три.js)
      if (anim.startValue && anim.startValue.isColor) {
        currentValue = new THREE.Color();
        currentValue.r = THREE.MathUtils.lerp(anim.startValue.r, anim.endValue.r, progress);
        currentValue.g = THREE.MathUtils.lerp(anim.startValue.g, anim.endValue.g, progress);
        currentValue.b = THREE.MathUtils.lerp(anim.startValue.b, anim.endValue.b, progress);
      } 
      // Для обычных чисел
      else {
        currentValue = THREE.MathUtils.lerp(anim.startValue, anim.endValue, progress);
      }
      
      // --- DEBUGGING START ---
      // Отключаем логирование каждого кадра анимации для снижения нагрузки на консоль
      /*if (anim.property === 'emissive' || anim.property === 'opacity') {
         // Выводим логи только при значимых изменениях или для отладки
         // console.log(`[DEBUG updateAnim] id: ${anim.id}, prop: ${anim.property}, progress: ${progress.toFixed(2)}, start:`, anim.startValue, `end:`, anim.endValue, `current:`, currentValue);
      }*/
      
      // Применяем значение к свойству объекта
      if (anim.target && anim.property && (typeof anim.target !== 'undefined') && (anim.target !== null)) {
        // Проверка на материал, который был уничтожен (dispose)
        if (anim.target instanceof THREE.Material && anim.target.disposed) {
          console.warn(`Material was disposed, removing animation:`, anim);
          animationsToRemove.push(i);
          return; // Пропускаем эту анимацию
        }
        
        // Проверка существования свойства для материалов
        if (anim.target instanceof THREE.Material && typeof anim.target[anim.property] === 'undefined') {
          console.warn(`Material property ${anim.property} undefined during animation:`, anim);
          animationsToRemove.push(i);
          return; // Пропускаем эту анимацию
        }

        // Особая обработка для материала
        if (anim.target instanceof THREE.Material) {
          if (anim.property === 'opacity') {
            // Проверка для opacity
            if (typeof currentValue === 'number' && isFinite(currentValue)) {
              anim.target.opacity = Math.max(0, Math.min(1, currentValue)); // Ограничиваем opacity диапазоном [0, 1]
              anim.target.transparent = anim.target.opacity < 1;
              anim.target.needsUpdate = true;
            } else {
              console.warn(`Invalid opacity value: ${currentValue}`);
            }
          } 
          else if (anim.property === 'color' || anim.property === 'emissive') {
            // Проверка для color и emissive
            if (currentValue && currentValue.isColor) {
              // Защита от NaN и Infinity
              if (isNaN(currentValue.r) || !isFinite(currentValue.r) ||
                  isNaN(currentValue.g) || !isFinite(currentValue.g) ||
                  isNaN(currentValue.b) || !isFinite(currentValue.b)) {
                console.error(`Invalid color components for ${anim.property}: r=${currentValue.r}, g=${currentValue.g}, b=${currentValue.b}`);
                // Восстанавливаем безопасные значения
                currentValue.r = Math.max(0, Math.min(1, anim.startValue.r));
                currentValue.g = Math.max(0, Math.min(1, anim.startValue.g));
                currentValue.b = Math.max(0, Math.min(1, anim.startValue.b));
              }
              
              anim.target[anim.property].copy(currentValue);
              anim.target.needsUpdate = true;
            } else {
              console.warn(`Invalid color value for ${anim.property}:`, currentValue);
            }
          }
          // Другие свойства материала
          else {
            anim.target[anim.property] = currentValue;
            anim.target.needsUpdate = true;
          }
        } 
        // Обработка для других объектов (не материалов)
        else {
          anim.target[anim.property] = currentValue;
        }
      }
      
      // Удаляем завершенную анимацию
      if (progress >= 1) {
        // --- DEBUGGING START (Final Value) ---
        // Логируем только завершение анимаций (и то, только при необходимости)
        /*if (anim.property === 'emissive' || anim.property === 'opacity') {
            // console.log(`[DEBUG updateAnim FINISH] id: ${anim.id}, prop: ${anim.property}, setting final value:`, anim.endValue);
        }*/
        
        // Убедимся, что финальное значение установлено точно
        if (anim.target && anim.property && (typeof anim.target !== 'undefined') && (anim.target !== null)) {
            // Проверка на материал, который был уничтожен (dispose)
            if (anim.target instanceof THREE.Material && anim.target.disposed) {
                console.warn(`Material was disposed at animation completion, removing:`, anim);
                animationsToRemove.push(i);
                return; // Пропускаем эту анимацию
            }
            
            // Дополнительно проверяем существование свойства для материалов
            if (anim.target instanceof THREE.Material && typeof anim.target[anim.property] === 'undefined') {
                console.warn(`Material property ${anim.property} undefined at animation completion:`, anim);
                animationsToRemove.push(i);
                return; // Пропускаем эту анимацию
            }

            // Установка финального значения
            if (anim.target instanceof THREE.Material) {
                if (anim.property === 'opacity') {
                    if (typeof anim.endValue === 'number' && isFinite(anim.endValue)) {
                        anim.target.opacity = Math.max(0, Math.min(1, anim.endValue));
                        anim.target.transparent = anim.target.opacity < 1;
                        anim.target.needsUpdate = true;
                    }
                } 
                else if (anim.property === 'color' || anim.property === 'emissive') {
                    if (anim.endValue && anim.endValue.isColor) {
                        anim.target[anim.property].copy(anim.endValue);
                        anim.target.needsUpdate = true;
                    }
                } 
                else {
                    anim.target[anim.property] = anim.endValue;
                    anim.target.needsUpdate = true;
                }
            } 
            else {
                anim.target[anim.property] = anim.endValue;
            }
        }
        
        // Обработка дополнительных действий после завершения анимации
        // Вызываем onComplete callback, если есть
        if (typeof anim.onComplete === 'function') {
            try {
                anim.onComplete();
            } catch (e) {
                console.error(`Ошибка в onComplete callback для анимации ${anim.id}:`, e);
            }
        }
        
        // Помечаем анимацию для удаления
        animationsToRemove.push(i);
      }
    });
    
    // Удаляем все завершенные или невалидные анимации
    // Сортируем индексы в порядке убывания, чтобы не нарушать порядок при удалении
    animationsToRemove.sort((a, b) => b - a).forEach(index => {
        this.activeAnimations.splice(index, 1);
    });
    
    // Очищаем ненужные материалы, если больше нет активных анимаций
    if (this.activeAnimations.length === 0) {
        this.cleanupUnusedMaterials();
    }
  }
  
  // Метод для очистки неиспользуемых материалов
  cleanupUnusedMaterials() {
    // console.log(`Очистка неиспользуемых материалов для ${this.type}`);
    
    // Проверяем модель
    if (!this.model) return;
    
    // Получаем список всех текущих материалов, используемых мешами
    const currentlyUsedMaterials = new Set();
    this.model.traverse(child => {
        if (child.isMesh && child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(mat => currentlyUsedMaterials.add(mat));
            } else {
                currentlyUsedMaterials.add(child.material);
            }
        }
    });
    
    // Находим материалы, которые не используются текущими мешами
    this.activeMaterials.forEach((material, key) => {
        if (!currentlyUsedMaterials.has(material)) {
            // Освобождаем ресурсы материала
            if (material && typeof material.dispose === 'function') {
                // console.log(`Освобождаю неиспользуемый материал: ${key}`);
                material.dispose();
            }
            // Удаляем из Map
            this.activeMaterials.delete(key);
        }
    });
  }

  // Метод для проигрывания анимации эффекта
  playEffectAnimation(effectType, targetUnit = null) {
    console.log(`Запуск анимации для эффекта: ${effectType} на юните ${this.type}`);
    // TODO: Реализовать логику анимации для разных эффектов
    
    switch (effectType) {
      case 'shield':
        // Анимация появления щита
        console.log(`Анимация: Щит применен к ${this.type}`);
        if (!this.shieldIndicator) {
          this.shieldIndicator = this.createShieldIndicator();
          if (!this.shieldIndicator) { // Убедимся, что индикатор создан
             console.error('Не удалось создать shieldIndicator для анимации.');
             return;
          }
        }
        
        // Делаем индикатор видимым перед анимацией
        this.shieldIndicator.visible = true;
        
        // Просто устанавливаем непрозрачность напрямую
        if (this.shieldIndicator.material) {
          this.shieldIndicator.material.transparent = true;
          this.shieldIndicator.material.opacity = 0.7;
          this.shieldIndicator.material.needsUpdate = true;
        }
        break;
      case 'damage':
        // Анимация получения урона (красная вспышка)
        console.log(`Анимация: ${this.type} получил урон`);
        // this.applyFlashAnimation(0xff0000); // ВРЕМЕННО ОТКЛЮЧЕНО - используется SkillAnimator
        break;
      case 'heal':
         // Анимация лечения (зеленая вспышка) - ОСТАВЛЯЕМ ВСПЫШКУ
         console.log(`Анимация: ${this.type} вылечен`);
         this.applyFlashAnimation(0x00ff00); // Зеленый
        break;
       case 'stun':
         // Анимация оглушения (КРАСНОЕ КОЛЬЦО)
         console.log(`Анимация: ${this.type} оглушен`);
         // Создаем/показываем красное кольцо
         if (!this.debuffIndicator) {
           this.debuffIndicator = this.createDebuffIndicator();
         }
         
         // Просто показываем индикатор напрямую
         if (this.debuffIndicator) {
             this.debuffIndicator.visible = true;
             if (this.debuffIndicator.material) {
               this.debuffIndicator.material.transparent = true;
               this.debuffIndicator.material.opacity = 0.7;
               this.debuffIndicator.material.needsUpdate = true;
             }
         } else { console.error("Не удалось создать debuffIndicator для анимации оглушения."); }
        break;
       case 'buff':
         // Анимация баффа (ЗЕЛЕНОЕ КОЛЬЦО)
         console.log(`Анимация: На ${this.type} наложен бафф`);
         // Создаем/показываем зеленое кольцо
         if (!this.buffIndicator) {
           this.buffIndicator = this.createBuffIndicator();
           console.log("Создан индикатор баффа для эффекта");
         }
         // Просто показываем индикатор напрямую
         if (this.buffIndicator) {
             this.buffIndicator.visible = true;
             if (this.buffIndicator.material) {
                this.buffIndicator.material.transparent = true;
                this.buffIndicator.material.opacity = 0.7;
                this.buffIndicator.material.needsUpdate = true;
             }
         } else { console.error("Не удалось создать buffIndicator для анимации баффа."); }
        break;
       case 'debuff':
         // Анимация дебаффа (КРАСНОЕ КОЛЬЦО)
         console.log(`Анимация: На ${this.type} наложен дебафф`);
          // Создаем/показываем красное кольцо
         if (!this.debuffIndicator) {
           this.debuffIndicator = this.createDebuffIndicator();
         }
         
         // Просто показываем индикатор напрямую
         if (this.debuffIndicator) {
             this.debuffIndicator.visible = true;
             if (this.debuffIndicator.material) {
               this.debuffIndicator.material.transparent = true;
               this.debuffIndicator.material.opacity = 0.7;
               this.debuffIndicator.material.needsUpdate = true;
             }
         } else { console.error("Не удалось создать debuffIndicator для анимации дебаффа."); }
        break;
      // ... другие типы эффектов ...
      default:
        console.log(`Нет анимации для эффекта: ${effectType}`);
    }
  }

  // Метод для сохранения оригинальных материалов меша
  saveMeshOriginalMaterials(mesh) {
    if (!mesh) return;
    
    mesh.traverse(child => {
      if (child.isMesh && child.material) {
        // Если материал - это массив
        if (Array.isArray(child.material)) {
          child.material.forEach((mat, index) => {
            const key = `${child.uuid}_${index}`;
            this.originalMaterials.set(key, mat.clone());
          });
        } 
        // Если материал - одиночный объект
        else {
          const key = child.uuid;
          this.originalMaterials.set(key, child.material.clone());
        }
      }
    });
  }
  
  // Метод для получения оригинального материала
  getOriginalMaterial(meshUuid, materialIndex = null) {
    const key = materialIndex !== null ? `${meshUuid}_${materialIndex}` : meshUuid;
    return this.originalMaterials.get(key);
  }
  
  // Метод для освобождения ресурсов неиспользуемых материалов
  disposeMaterials() {
    // Освобождаем активные материалы
    this.activeMaterials.forEach((material, key) => {
      if (material && typeof material.dispose === 'function') {
        material.dispose();
      }
    });
    
    this.activeMaterials.clear();
  }
} 