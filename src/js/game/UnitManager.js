import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

export class UnitManager {
  constructor(scene, board, unitFactory, uiManager, cameraRef) {
    this.scene = scene;
    this.board = board;
    this.unitFactory = unitFactory;
    this.uiManager = uiManager;
    this.cameraRef = cameraRef;
    this.units = [];
    this.unitsByPosition = new Map(); // Карта юнитов по позициям для быстрого поиска
  }

  async init() {
    // Инициализация менеджера
    return true;
  }

  createUnit(type, position, ownerColor) {
    // Создаем новый юнит с помощью фабрики
    const unit = this.unitFactory.createUnit(type, ownerColor);
    
    if (!unit) {
      console.error(`Не удалось создать юнит типа ${type}`);
      return null;
    }
    
    // Добавляем 3D модель юнита на сцену, если она существует
    if (unit.model) {
      this.scene.add(unit.model);
    } else {
      console.warn(`Модель для юнита типа ${type} отсутствует, не добавляем на сцену.`);
    }
    
    // Размещаем юнит на доске (устанавливает позицию и видимость)
    unit.placeOnBoard(position.x, position.z, this.board);
    
    // Обновляем данные о клетке - теперь она содержит юнит
    const squareIndex = position.x * this.board.size + position.z;
    if (this.board.squareData[squareIndex]) {
      this.board.squareData[squareIndex].unit = unit;
    }
    
    // Добавляем юнит в список
    this.units.push(unit);
    
    // Добавляем в карту позиций
    const posKey = `${position.x},${position.z}`;
    this.unitsByPosition.set(posKey, unit);
    
    return unit;
  }
  
  removeUnit(unit, isResetting = false) {
    // Удаляем модель со сцены
    if (unit.model) {
      this.scene.remove(unit.model);
    }
    
    // Удаляем юнит из клетки, на которой он стоял
    const squareIndex = unit.position.x * this.board.size + unit.position.z;
    if (this.board.squareData[squareIndex]) {
      this.board.squareData[squareIndex].unit = null;
    }
    
    // Удаляем юнит из списка
    const index = this.units.indexOf(unit);
    if (index !== -1) {
      this.units.splice(index, 1);
    }
    
    // Удаляем из карты позиций
    const posKey = `${unit.position.x},${unit.position.z}`;
    this.unitsByPosition.delete(posKey);

    // --- ИЗМЕНЯЕМ ПРОВЕРКУ НА СМЕРТЬ КОРОЛЯ ---
    // Вызываем gameOver только если это не сброс игры
    if (unit.type === 'king' && !isResetting) {
      console.log(`Король (${unit.ownerColor}) удален во время игры. Завершаем игру.`);
      // Вызываем метод gameOver из экземпляра Game
      // Передаем цвет победившего игрока
      const winnerColor = (unit.ownerColor === 'white') ? 'black' : 'white';
      this.game.gameOver(winnerColor);
    }
    // --- КОНЕЦ ПРОВЕРКИ ---
  }
  
  removeAllUnits() {
    console.log("Удаление всех юнитов...");
    // Создаем копию массива, так как removeUnit будет изменять оригинальный массив this.units
    const unitsToRemove = [...this.units];
    unitsToRemove.forEach(unit => {
      this.removeUnit(unit, true); // Передаем true, чтобы не вызывать gameOver
    });
    // Дополнительно очищаем структуры данных на всякий случай
    this.units = [];
    this.unitsByPosition.clear();
    // Очищаем данные о юнитах на клетках доски
    this.board.squareData.forEach(square => {
        if (square) {
            square.unit = null;
        }
    });
    console.log("Все юниты удалены.");
  }
  
  moveUnit(unit, targetPosition) {
    console.log(`Перемещение ${unit.type} с (${unit.position.x},${unit.position.z}) на (${targetPosition.x},${targetPosition.z})`);
    
    // Сохраняем старую позицию ДО её изменения в placeOnBoard
    const oldPosition = { x: unit.position.x, z: unit.position.z };
    const oldSquareIndex = oldPosition.x * this.board.size + oldPosition.z;
    const oldPosKey = `${oldPosition.x},${oldPosition.z}`;
    
    // Удаляем юнит из текущей клетки в squareData
    if (this.board.squareData[oldSquareIndex]) {
      this.board.squareData[oldSquareIndex].unit = null;
      console.log(`Освобождена клетка ${oldSquareIndex}`);
    }
    
    // Удаляем из карты позиций по старому ключу
    this.unitsByPosition.delete(oldPosKey);
    console.log(`Удалена запись из карты по ключу ${oldPosKey}`);
    
    // Перемещаем юнит на новую клетку (это меняет unit.position!)
    unit.placeOnBoard(targetPosition.x, targetPosition.z, this.board);
    
    // Обновляем данные о новой клетке в squareData
    const newSquareIndex = targetPosition.x * this.board.size + targetPosition.z;
    if (this.board.squareData[newSquareIndex]) {
      this.board.squareData[newSquareIndex].unit = unit;
      console.log(`Занята клетка ${newSquareIndex}`);
    }
    
    // Добавляем в карту по новой позиции
    const newPosKey = `${targetPosition.x},${targetPosition.z}`;
    this.unitsByPosition.set(newPosKey, unit);
    console.log(`Добавлена запись в карту по ключу ${newPosKey}`);
  }
  
  attackUnit(attacker, target) {
    // Базовая механика атаки
    let damage = attacker.baseDamage;
    
    // Проверяем наличие баффа на урон у атакующего
    const damageBuff = attacker.effects.find(effect => effect.type === 'buff' && effect.value > 0);
    if (damageBuff) {
      console.log(`Атакующий ${attacker.type} под баффом, +${damageBuff.value} урона`);
      damage += damageBuff.value;
      // Удаляем бафф после использования (если он длился 1 ход)
      attacker.effects = attacker.effects.filter(effect => effect !== damageBuff);
      attacker.updateStatusIndicators(); // Обновляем индикаторы, если бафф пропал
    }
    
    // Проверяем наличие дебаффа на урон у атакующего ('Проклятие слабости')
    const damageDebuff = attacker.effects.find(effect => effect.type === 'debuff' && effect.value > 0);
    if (damageDebuff) {
      console.log(`Атакующий ${attacker.type} под дебаффом, -${damageDebuff.value} урона`);
      damage = Math.max(0, damage - damageDebuff.value);
      // Дебафф не удаляется после атаки, он длится buffDuration ходов
    }
    
    // TODO: Проверить дебаффы на цели (уменьшение брони/защиты?)
    // TODO: Проверить эффекты перенаправления урона (Телохранитель) - УЖЕ СДЕЛАНО в takeDamage

    console.log(`Атака: ${attacker.type} -> ${target.type}, Урон: ${damage}`);
    const isKilled = target.takeDamage(damage);
    
    // Запускаем анимацию получения урона
    if (target && typeof target.playEffectAnimation === 'function') {
      target.playEffectAnimation('damage', attacker);
      // Показываем всплывающий текст урона
      if (this.uiManager && damage > 0) {
         const worldPos = target.model.position.clone(); // Берем позицию модели юнита
         this.uiManager.showFloatingText(`-${damage}`, '#ff0000', worldPos, this.scene, this.cameraRef);
      }
    }

    if (isKilled) {
      // Если цель уничтожена, удаляем её
      this.removeUnit(target);
    }
    
    // Возвращаем флаг, был ли юнит убит
    return isKilled;
  }
  
  useSkill(unit, skillIndex, targetPosition) {
    // Проверяем, что навык существует
    if (!unit.skills || skillIndex >= unit.skills.length) {
      console.error("Навык не найден");
      return false;
    }
    
    const skill = unit.skills[skillIndex];
    
    // Проверяем, что навык не на кулдауне и хватает маны
    if (skill.currentCooldown > 0) {
      console.error("Навык на перезарядке");
      return false;
    }
    
    if (unit.mp < skill.manaCost) {
      console.error("Недостаточно маны");
      return false;
    }
    
    // Тратим ману
    unit.useMana(skill.manaCost);
    
    // Устанавливаем кулдаун
    skill.currentCooldown = skill.cooldown;
    
    // Применяем эффекты навыка в зависимости от его типа
    if (skill.targetType === 'enemy') {
      // Навык нацелен на врага
      const targetUnit = this.getUnitAtPosition(targetPosition);
      
      if (targetUnit && targetUnit.ownerColor !== unit.ownerColor) {
        // Наносим урон
        if (skill.damage > 0) {
          const isKilled = targetUnit.takeDamage(skill.damage);
          
          // Запускаем анимацию получения урона
          if (targetUnit && typeof targetUnit.playEffectAnimation === 'function') {
            targetUnit.playEffectAnimation('damage', unit);
            // Показываем всплывающий текст урона
            if (this.uiManager && skill.damage > 0) {
               const worldPos = targetUnit.model.position.clone(); 
               this.uiManager.showFloatingText(`-${skill.damage}`, '#ff0000', worldPos, this.scene, this.cameraRef);
            }
          }
          
          if (isKilled) {
            this.removeUnit(targetUnit);
          }
        }
        
        // Применяем дополнительные эффекты
        // Проверяем наличие эффекта оглушения
        const hasStunEffect = skill.effectType && skill.effectType.includes('stun') || 
                              skill.name === 'Кавалерийский бросок';
        
        if (hasStunEffect) {
          console.log(`Применяем оглушение на ${targetUnit.type} на ${skill.stunDuration || 1} ход(а)`);
          targetUnit.addEffect({
            type: 'stun',
            duration: skill.stunDuration || 1
          });
          // Запускаем анимацию оглушения
          if (targetUnit && typeof targetUnit.playEffectAnimation === 'function') {
            targetUnit.playEffectAnimation('stun', unit);
            // Показываем всплывающий текст стана
            if (this.uiManager) {
              const worldPos = targetUnit.model.position.clone(); 
              this.uiManager.showFloatingText('Оглушение!', '#ffff00', worldPos, this.scene, this.cameraRef);
            }
          }
        }
        
        if (skill.effectType.includes('debuff')) {
          console.log(`Применяем дебафф к ${targetUnit.type} от ${unit.type}`);
          targetUnit.addEffect({
            type: 'debuff',
            value: skill.debuffDamage || 0, // Значение дебаффа (снижение урона цели)
            noManaRegen: skill.noManaRegen || false, // Добавляем флаг блокировки маны
            duration: skill.debuffDuration || 1
          });
          // Запускаем анимацию дебаффа
          if (targetUnit && typeof targetUnit.playEffectAnimation === 'function') {
            targetUnit.playEffectAnimation('debuff', unit);
            // Показываем всплывающий текст дебаффа
            if (this.uiManager && skill.debuffDamage) {
              const worldPos = targetUnit.model.position.clone(); 
              this.uiManager.showFloatingText(`-${skill.debuffDamage} ATK`, '#ff6600', worldPos, this.scene, this.cameraRef);
            }
          }
        }

        // Другие эффекты
        if (skill.effectType.includes('buff')) {
          // Для "Телохранителя" нужно добавить особый эффект
          if (skill.name === 'Телохранитель') {
             console.log(`Применяем эффект 'protected' от ${unit.type} к ${targetUnit.type}`);
             targetUnit.addEffect({
               type: 'protected', // Новый тип эффекта
               duration: skill.buffDuration || 1,
               protector: unit, // Ссылка на коня-защитника
               reduction: skill.damageReduction || 0 // Снижение урона для коня
             });
             // Запускаем анимацию баффа (для Телохранителя)
             if (targetUnit && typeof targetUnit.playEffectAnimation === 'function') {
               targetUnit.playEffectAnimation('buff', unit);
               // Показываем всплывающий текст "Защита!"
               if (this.uiManager) {
                  const worldPos = targetUnit.model.position.clone(); 
                  this.uiManager.showFloatingText('Защита!', '#00ff00', worldPos, this.scene, this.cameraRef);
               }
             }
          } else {
             // Обычный бафф (например, Боевой клич)
             targetUnit.addEffect({
               type: 'buff',
               value: skill.buffValue || 0,
               duration: skill.buffDuration || 1
             });
             // Запускаем анимацию баффа
             if (targetUnit && typeof targetUnit.playEffectAnimation === 'function') {
               targetUnit.playEffectAnimation('buff', unit);
               // Показываем всплывающий текст баффа
               if (this.uiManager && skill.buffValue) {
                  const worldPos = targetUnit.model.position.clone(); 
                  this.uiManager.showFloatingText(`+${skill.buffValue} ATK`, '#00ff00', worldPos, this.scene, this.cameraRef);
               }
             }
          }
        }
      }
      
      // Проверка и применение AoE эффектов
      if (skill.aoe) {
        if (skill.attackPattern === 'line') {
          // Линейный AoE - требуется особая обработка для "Землетрясения"
          this.applyLineAoEDamage(targetPosition, skill, unit);
        } else if (skill.aoeRange) {
          // Обычный AoE в радиусе
          this.applyAoEDamage(targetPosition, skill, unit);
        }
      }
    } else if (skill.targetType === 'ally') {
      // Проверяем, является ли навык глобальным
      if (skill.global) {
        console.log(`Применяем глобальный союзный навык: ${skill.name}`);
        this.units.forEach(allyUnit => {
          if (allyUnit.ownerColor === unit.ownerColor) {
            // Лечение
            if (skill.damage < 0) {
              allyUnit.heal(Math.abs(skill.damage));
              // Запускаем анимацию лечения
              if (allyUnit && typeof allyUnit.playEffectAnimation === 'function') {
                allyUnit.playEffectAnimation('heal', unit);
                // Показываем всплывающий текст лечения
                if (this.uiManager && skill.damage < 0) {
                  const worldPos = allyUnit.model.position.clone();
                  this.uiManager.showFloatingText(`+${Math.abs(skill.damage)} HP`, '#00dd00', worldPos, this.scene, this.cameraRef); 
                }
              }
            }
            // Восстановление маны
            if (skill.effectType.includes('mana') && skill.manaBonus) {
              allyUnit.restoreMana(skill.manaBonus);
              // Запускаем анимацию восстановления маны
              if (allyUnit && typeof allyUnit.playEffectAnimation === 'function') {
                allyUnit.playEffectAnimation('mana', unit);
                // Показываем всплывающий текст маны
                if (this.uiManager && skill.manaBonus) {
                   const worldPos = allyUnit.model.position.clone();
                   this.uiManager.showFloatingText(`+${skill.manaBonus} MP`, '#00aaff', worldPos, this.scene, this.cameraRef); 
                }
              }
            }
            // TODO: Добавить другие глобальные союзные эффекты, если нужно
          }
        });
      } else {
        // Навык нацелен на конкретного союзника
        const targetUnit = this.getUnitAtPosition(targetPosition);
        // Лог 1: Проверяем, найден ли юнит
        console.log(`[useSkill - ally] Вызов getUnitAtPosition для ${targetPosition.x},${targetPosition.z}. Результат:`, targetUnit?.type || 'null');

        if (targetUnit && targetUnit.ownerColor === unit.ownerColor) {
           // Лог 2: Условие выполнено
           console.log(`[useSkill - ally] Юнит ${targetUnit.type} найден и является союзником (target.ownerColor=${targetUnit.ownerColor}, caster.ownerColor=${unit.ownerColor}). Применяем эффекты...`);
          // Лечение
          if (skill.damage < 0) {
            targetUnit.heal(Math.abs(skill.damage));
            // Запускаем анимацию лечения
            if (targetUnit && typeof targetUnit.playEffectAnimation === 'function') {
              targetUnit.playEffectAnimation('heal', unit);
              // Показываем всплывающий текст лечения
              if (this.uiManager && skill.damage < 0) {
                 const worldPos = targetUnit.model.position.clone();
                 this.uiManager.showFloatingText(`+${Math.abs(skill.damage)} HP`, '#00dd00', worldPos, this.scene, this.cameraRef);
              }
            }
          }
          
          // Другие эффекты
          if (skill.effectType.includes('buff')) {
             // Проверка для "Телохранителя" (уже добавлена ранее)
             if (skill.name === 'Телохранитель') {
                 console.log(`Применяем эффект 'protected' от ${unit.type} к ${targetUnit.type}`);
                 targetUnit.addEffect({
                   type: 'protected', 
                   duration: skill.buffDuration || 1,
                   protector: unit, 
                   reduction: skill.damageReduction || 0 
                 });
                 // Запускаем анимацию баффа (для Телохранителя)
                 if (targetUnit && typeof targetUnit.playEffectAnimation === 'function') {
                    targetUnit.playEffectAnimation('buff', unit);
                    // Показываем всплывающий текст "Защита!"
                    if (this.uiManager) {
                        const worldPos = targetUnit.model.position.clone(); 
                        this.uiManager.showFloatingText('Защита!', '#00ff00', worldPos, this.scene, this.cameraRef);
                    }
                 }
             } else if (skill.name !== 'Телохранитель') { // Исправлено: else if, чтобы не применять дважды
                targetUnit.addEffect({
                  type: 'buff',
                  value: skill.buffValue || 0,
                  duration: skill.buffDuration || 1
                });
                // Запускаем анимацию баффа
                if (targetUnit && typeof targetUnit.playEffectAnimation === 'function') {
                   targetUnit.playEffectAnimation('buff', unit);
                   // Показываем всплывающий текст баффа
                   if (this.uiManager && skill.buffValue) {
                      const worldPos = targetUnit.model.position.clone(); 
                      this.uiManager.showFloatingText(`+${skill.buffValue} ATK`, '#00ff00', worldPos, this.scene, this.cameraRef);
                   }
                }
             }
          }
          
          if (skill.effectType.includes('shield')) {
            targetUnit.addShield(skill.shieldValue || 0);
            targetUnit.addEffect({
              type: 'shield',
              duration: skill.buffDuration || 1
            });
             // Запускаем анимацию щита
             if (targetUnit && typeof targetUnit.playEffectAnimation === 'function') {
               targetUnit.playEffectAnimation('shield', unit);
               // Показываем всплывающий текст щита
               if (this.uiManager && skill.shieldValue) {
                  const worldPos = targetUnit.model.position.clone(); 
                  this.uiManager.showFloatingText(`+${skill.shieldValue} Щит`, '#00ffff', worldPos, this.scene, this.cameraRef);
               }
             }
          }
          
          if (skill.effectType.includes('mana') && skill.manaBonus) {
            targetUnit.restoreMana(skill.manaBonus);
            // Запускаем анимацию восстановления маны
            if (targetUnit && typeof targetUnit.playEffectAnimation === 'function') {
              targetUnit.playEffectAnimation('mana', unit);
              // Показываем всплывающий текст маны
              if (this.uiManager && skill.manaBonus) {
                  const worldPos = targetUnit.model.position.clone(); 
                  this.uiManager.showFloatingText(`+${skill.manaBonus} MP`, '#00aaff', worldPos, this.scene, this.cameraRef);
              }
            }
          }
           // TODO: Добавить обработку 'cleanse' для Исцеляющей молитвы
        } else {
            // Лог 3: Условие НЕ выполнено
            console.log(`[useSkill - ally] Условие (targetUnit && targetUnit.ownerColor === unit.ownerColor) НЕ выполнено. targetUnit: ${targetUnit?.type}, target.ownerColor: ${targetUnit?.ownerColor}, caster.ownerColor: ${unit.ownerColor}`);
        }
      }
    }
    
    return true;
  }
  
  applyAoEDamage(targetPosition, skill, unit) {
    // Применяем AoE урон вокруг целевой позиции
    const aoeRange = skill.aoeRange || 1;
    const aoeDamage = skill.aoeDamage || skill.damage;
    
    for (let dx = -aoeRange; dx <= aoeRange; dx++) {
      for (let dz = -aoeRange; dz <= aoeRange; dz++) {
        // Пропускаем центральную клетку (она уже обработана)
        if (dx === 0 && dz === 0) continue;
        
        // Проверяем, что клетка находится в пределах реального радиуса AOE (Манхэттенское расстояние)
        if (Math.abs(dx) + Math.abs(dz) > aoeRange) continue;
        
        const x = targetPosition.x + dx;
        const z = targetPosition.z + dz;
        
        // Проверяем, что клетка в пределах доски
        if (x >= 0 && x < this.board.size && z >= 0 && z < this.board.size) {
          // Находим юнит по позиции
          const aoeTarget = this.getUnitAtPosition({ x, z });
          
          // Наносим урон всем вражеским юнитам в области
          if (aoeTarget && aoeTarget.ownerColor !== unit.ownerColor) {
            const actualDamage = aoeTarget.takeDamage(aoeDamage);
            
            // Запускаем анимацию получения урона для AoE
            if (aoeTarget && typeof aoeTarget.playEffectAnimation === 'function') {
              aoeTarget.playEffectAnimation('damage', unit);
              // Показываем всплывающий текст урона AoE
              if (this.uiManager && aoeDamage > 0) {
                const worldPos = aoeTarget.model.position.clone(); 
                this.uiManager.showFloatingText(`-${aoeDamage}`, '#ff0000', worldPos, this.scene, this.cameraRef);
              }
            }

            // Если цель уничтожена, удаляем ее
            if (aoeTarget.hp <= 0) {
              this.removeUnit(aoeTarget);
            }
          }
        }
      }
    }
  }
  
  applyLineAoEDamage(targetPosition, skill, unit) {
    const { x: unitX, z: unitZ } = unit.position;
    const { x: targetX, z: targetZ } = targetPosition;
    
    // Определяем направление линии от юнита к цели
    let dirX = 0;
    let dirZ = 0;
    
    if (targetX > unitX) dirX = 1;
    else if (targetX < unitX) dirX = -1;
    
    if (targetZ > unitZ) dirZ = 1;
    else if (targetZ < unitZ) dirZ = -1;
    
    // Наносим урон по всей линии (включая первую цель)
    for (let i = 1; i <= skill.range; i++) {
      const newX = unitX + i * dirX;
      const newZ = unitZ + i * dirZ;
      
      // Проверяем, что позиция в пределах доски
      if (newX >= 0 && newX < this.board.size && newZ >= 0 && newZ < this.board.size) {
        const targetUnit = this.getUnitAtPosition({ x: newX, z: newZ });
        
        // Если на клетке есть вражеский юнит, наносим ему урон
        if (targetUnit && targetUnit.ownerColor !== unit.ownerColor) {
          const isKilled = targetUnit.takeDamage(skill.damage);
          
          // Запускаем анимацию получения урона для линейного AoE
          if (targetUnit && typeof targetUnit.playEffectAnimation === 'function') {
            targetUnit.playEffectAnimation('damage', unit);
            // Показываем всплывающий текст урона линейного AoE
            if (this.uiManager && skill.damage > 0) {
               const worldPos = targetUnit.model.position.clone(); 
               this.uiManager.showFloatingText(`-${skill.damage}`, '#ff0000', worldPos, this.scene, this.cameraRef);
            }
          }

          if (isKilled) {
            this.removeUnit(targetUnit);
          }
        }
      } else {
        // Прерываем, если вышли за пределы доски
        break;
      }
    }
  }
  
  getUnitAtPosition(position) {
    // Проверяем входные данные
    if (!position || position.x === undefined || position.z === undefined) {
      console.warn("getUnitAtPosition: некорректная позиция", position);
      return null;
    }
    
    // Проверяем, находится ли позиция в пределах доски
    if (!this.isValidPosition(position)) {
      return null;
    }
    
    // Получаем юнит по ключу из карты позиций
    const posKey = `${position.x},${position.z}`;
    return this.unitsByPosition.get(posKey) || null;
  }
  
  getUnitByObject(object) {
    // Находим юнит по его 3D-объекту
    for (const unit of this.units) {
      if (unit.model === object || unit.model.children.includes(object)) {
        return unit;
      }
    }
    return null;
  }
  
  getUnitObjects() {
    // Возвращает все 3D объекты юнитов, включая и их дочерние объекты
    const objects = [];
    for (const unit of this.units) {
      if (unit.model) {
        objects.push(unit.model);
        // Добавляем все дочерние объекты для лучшего обнаружения при клике
        unit.model.traverse((child) => {
          if (child !== unit.model) {
            objects.push(child);
          }
        });
      }
    }
    console.log(`Получено ${objects.length} объектов для Raycaster`);
    return objects;
  }
  
  getUnits() {
    // Возвращает все юниты
    return this.units;
  }
  
  updateUnitsState(finishedTurnColor) {
    console.log(`[UnitManager] Обновление состояния для юнитов цвета: ${finishedTurnColor}`); // Лог для проверки
    // Обновляем состояние всех юнитов (кулдауны, эффекты, регенерация маны)
    this.units.forEach(unit => {
      // Обновляем состояние только для юнитов, чей ход только что закончился
      const unitColor = unit.ownerColor;
      
      // --- DEBUG START: Логируем КАЖДЫЙ юнит перед проверкой цвета --- 
      console.log(`  -- Проверяю юнита: ${unit.type} (${unitColor}). Ожидаемый цвет: ${finishedTurnColor}`);
      // --- DEBUG END ---
      
      // Используем переданный цвет напрямую
      if (unitColor === finishedTurnColor) {
        console.log(` -> Обновляю ${unit.type} (${unitColor})`); // Доп. лог
        unit.removeExpiredEffects();
        // Обновляем кулдауны
        if (unit.skills) {
          for (const skill of unit.skills) {
            if (skill.currentCooldown > 0) {
              skill.currentCooldown--;
            }
          }
        }
        
        // Восстановление маны (на 5 единиц за ход)
        // Проверяем, не заблокирована ли регенерация маны дебаффом
        const manaBlockDebuff = unit.effects.find(effect => effect.type === 'debuff' && effect.noManaRegen);
        if (!manaBlockDebuff) {
            unit.restoreMana(5);
        } else {
            console.log(` -> Регенерация маны для ${unit.type} заблокирована дебаффом`);
        }
      }
    });
  }
  
  getValidMoves(unit) {
    // Получаем все возможные ходы юнита по правилам шахмат
    return unit.getPossibleMoves(this.board);
  }
  
  getValidSkillTargets(unit, skill) {
    // Определяем доступные цели для навыка
    const targets = [];
    
    // Получаем базовую позицию юнита
    const { x, z } = unit.position;
    
    // Разные типы навыков имеют разные паттерны выбора цели
    if (skill.targetType === 'enemy') {
      // Для навыков, нацеленных на врагов
      
      if (skill.name === 'Кавалерийский бросок') {
        // Специальная обработка для навыка коня - L-образное движение
        const knightMoves = [
          {dx: 1, dz: 2}, {dx: 1, dz: -2}, {dx: -1, dz: 2}, {dx: -1, dz: -2},
          {dx: 2, dz: 1}, {dx: 2, dz: -1}, {dx: -2, dz: 1}, {dx: -2, dz: -1}
        ];
        
        for (const move of knightMoves) {
          const newX = x + move.dx;
          const newZ = z + move.dz;
          
          // Проверяем, что позиция находится в пределах доски
          if (newX >= 0 && newX < this.board.size && newZ >= 0 && newZ < this.board.size) {
            const targetUnit = this.getUnitAtPosition({ x: newX, z: newZ });
            
            // Добавляем позицию, если на ней есть вражеский юнит или клетка пуста
            if (!targetUnit || targetUnit.ownerColor !== unit.ownerColor) {
              targets.push({ x: newX, z: newZ });
            }
          }
        }
      } else if (skill.aoe && skill.aoeRange > 0 && !skill.attackPattern && skill.range === 0) {
        // Для AOE навыков без явного выбора цели - всё в радиусе aoeRange
        console.log(`Определение целей для AOE без выбора цели: ${skill.name}`);
        for (let dx = -skill.aoeRange; dx <= skill.aoeRange; dx++) {
          for (let dz = -skill.aoeRange; dz <= skill.aoeRange; dz++) {
            // Пропускаем центр, если навык не бьет по своей клетке (по умолчанию пропускаем)
            if (dx === 0 && dz === 0 && !skill.hitSelf) continue;
            
            const newX = x + dx;
            const newZ = z + dz;
            
            // Проверяем, что позиция находится в пределах доски
            if (newX >= 0 && newX < this.board.size && newZ >= 0 && newZ < this.board.size) {
              const targetUnit = this.getUnitAtPosition({ x: newX, z: newZ });
              
              // Добавляем позицию, если на ней есть вражеский юнит
              if (targetUnit && targetUnit.ownerColor !== unit.ownerColor) {
                targets.push({ x: newX, z: newZ });
              }
            }
          }
        }
      } else if (skill.attackPattern === 'diagonal') {
        // Для атак по диагонали (как у слона)
        for (const dirX of [-1, 1]) {
          for (const dirZ of [-1, 1]) {
            for (let i = 1; i <= (skill.range || 1); i++) {
              const newX = x + i * dirX;
              const newZ = z + i * dirZ;
              
              // Проверяем, что позиция находится в пределах доски
              if (newX >= 0 && newX < this.board.size && newZ >= 0 && newZ < this.board.size) {
                const targetUnit = this.getUnitAtPosition({ x: newX, z: newZ });
                
                if (!targetUnit) {
                  // Если клетка пуста, добавляем её и продолжаем в том же направлении
                  targets.push({ x: newX, z: newZ });
                } else if (targetUnit.ownerColor !== unit.ownerColor) {
                  // Если на клетке враг, добавляем её и прекращаем поиск в этом направлении
                  targets.push({ x: newX, z: newZ });
                  break;
                } else {
                  // Если на клетке союзник, прекращаем поиск в этом направлении
                  break;
                }
              } else {
                break;
              }
            }
          }
        }
      } else if (skill.attackPattern === 'line') {
        // Для атак по линии (как у ладьи)
        for (const dir of [-1, 1]) {
          // Горизонтальная линия
          for (let i = 1; i <= (skill.range || 1); i++) {
            const newX = x + i * dir;
            const newZ = z;
            
            if (newX >= 0 && newX < this.board.size) {
              const targetUnit = this.getUnitAtPosition({ x: newX, z: newZ });
              
              if (!targetUnit) {
                targets.push({ x: newX, z: newZ });
              } else if (targetUnit.ownerColor !== unit.ownerColor) {
                targets.push({ x: newX, z: newZ });
                break;
              } else {
                break;
              }
            } else {
              break;
            }
          }
          
          // Вертикальная линия
          for (let i = 1; i <= (skill.range || 1); i++) {
            const newX = x;
            const newZ = z + i * dir;
            
            if (newZ >= 0 && newZ < this.board.size) {
              const targetUnit = this.getUnitAtPosition({ x: newX, z: newZ });
              
              if (!targetUnit) {
                targets.push({ x: newX, z: newZ });
              } else if (targetUnit.ownerColor !== unit.ownerColor) {
                targets.push({ x: newX, z: newZ });
                break;
              } else {
                break;
              }
            } else {
              break;
            }
          }
        }
      } else {
        // Для обычных атак - в пределах указанной дальности
        for (let dx = -skill.range; dx <= skill.range; dx++) {
          for (let dz = -skill.range; dz <= skill.range; dz++) {
            // Пропускаем центральную клетку (где стоит сам юнит)
            if (dx === 0 && dz === 0) continue;
            
            // Проверяем, что расстояние не превышает радиус действия навыка
            if (Math.abs(dx) + Math.abs(dz) > skill.range) continue;
            
            const newX = x + dx;
            const newZ = z + dz;
            
            // Проверяем, что позиция находится в пределах доски
            if (newX >= 0 && newX < this.board.size && newZ >= 0 && newZ < this.board.size) {
              const targetUnit = this.getUnitAtPosition({ x: newX, z: newZ });
              
              // Добавляем позицию, если на ней есть вражеский юнит или её можно атаковать
              if (!targetUnit || targetUnit.ownerColor !== unit.ownerColor) {
                targets.push({ x: newX, z: newZ });
              }
            }
          }
        }
      }
    } else if (skill.targetType === 'ally') {
      // Для навыков, нацеленных на союзников
      
      if (skill.global) {
        // Глобальные навыки (как королевское благословение) затрагивают всех союзников
        for (let newX = 0; newX < this.board.size; newX++) {
          for (let newZ = 0; newZ < this.board.size; newZ++) {
            const targetUnit = this.getUnitAtPosition({ x: newX, z: newZ });
            
            if (targetUnit && targetUnit.ownerColor === unit.ownerColor) {
              targets.push({ x: newX, z: newZ });
            }
          }
        }
      } else {
        // Навыки с ограниченным радиусом действия
        for (let dx = -skill.range; dx <= skill.range; dx++) {
          for (let dz = -skill.range; dz <= skill.range; dz++) {
            // Можно применять навык к себе, если не указано иное
            if (dx === 0 && dz === 0 && !skill.excludeSelf) {
              targets.push({ x, z });
              continue;
            }
            
            // Проверяем, что расстояние не превышает радиус действия навыка
            if (Math.abs(dx) + Math.abs(dz) > skill.range) continue;
            
            const newX = x + dx;
            const newZ = z + dz;
            
            // Проверяем, что позиция находится в пределах доски
            if (newX >= 0 && newX < this.board.size && newZ >= 0 && newZ < this.board.size) {
              const targetUnit = this.getUnitAtPosition({ x: newX, z: newZ });
              
              // Добавляем позицию, если на ней есть союзный юнит
              if (targetUnit && targetUnit.ownerColor === unit.ownerColor) {
                targets.push({ x: newX, z: newZ });
              }
            }
          }
        }
      }
    }
    
    // Лог для отладки: какие цели были найдены
    console.log(`Найдены цели для ${skill.name} юнита ${unit.type}:`, JSON.stringify(targets)); 
    return targets;
  }
  
  isValidPosition(position) {
    // Проверяет, что позиция находится в пределах доски
    return (
      position.x >= 0 &&
      position.x < this.board.size &&
      position.z >= 0 &&
      position.z < this.board.size
    );
  }
} 